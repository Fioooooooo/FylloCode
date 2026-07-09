import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

import {
  clearGitStatsCache,
  computeRecentGuidelines,
  computeSpecsGrowth,
  getGitGovernance,
} from "@main/services/insight/overview/git-stats";

type SpawnChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

type SpawnResult = {
  stdout?: string;
  stderr?: string;
  code?: number;
};

type SpawnCall = {
  command: string;
  args: string[];
};

function createChild(): SpawnChild {
  const child = new EventEmitter() as SpawnChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

function mockSpawnRouter(router: (command: string, args: string[]) => SpawnResult): SpawnCall[] {
  const calls: SpawnCall[] = [];
  mocks.spawn.mockImplementation((command: string, args: string[]) => {
    calls.push({ command, args });
    const child = createChild();
    queueMicrotask(() => {
      const result = router(command, args);
      child.stdout.write(result.stdout ?? "");
      child.stderr.write(result.stderr ?? "");
      child.stdout.end();
      child.stderr.end();
      child.emit("close", result.code ?? 0);
    });
    return child;
  });
  return calls;
}

describe("overview git stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00.000Z"));
    clearGitStatsCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearGitStatsCache();
  });

  it("computes eight weekly specs buckets from git snapshots", async () => {
    let revListIndex = 0;
    const calls = mockSpawnRouter((_command, args) => {
      if (args[0] === "rev-list") {
        revListIndex += 1;
        return { stdout: `sha-${revListIndex}\n` };
      }
      if (args[0] === "ls-tree") {
        const count = Number(String(args[3]).replace("sha-", ""));
        return {
          stdout: Array.from({ length: count }, (_, index) => `openspec/specs/spec-${index}`).join(
            "\n"
          ),
        };
      }
      return { stdout: "" };
    });

    const growth = await computeSpecsGrowth("/repo");

    expect(growth).toHaveLength(8);
    expect(growth.map((bucket) => bucket.cumulativeCount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(calls).toHaveLength(16);
    expect(calls[0]?.command).toBe("git");
    expect(calls[0]?.args.slice(0, 2)).toEqual(["rev-list", "-1"]);
    expect(calls[1]?.args).toEqual(["ls-tree", "-d", "--name-only", "sha-1", "openspec/specs/"]);
  });

  it("deduplicates and sorts recent guideline commits", async () => {
    mockSpawnRouter(() => ({
      stdout: [
        "2026-06-10T00:00:00.000Z\tdocs(ipc): clarify overview channel and a very long message that should be truncated at eighty characters exactly",
        "guidelines/IPC.md",
        "guidelines/MainProcess.md",
        "",
        "2026-06-09T00:00:00.000Z\tdocs(ipc): older ipc message",
        "guidelines/IPC.md",
        "",
        "2026-06-08T00:00:00.000Z\tdocs(renderer): overview store",
        "guidelines/RendererProcess.md",
      ].join("\n"),
    }));

    const result = await computeRecentGuidelines("/repo");

    expect(result.guidelinesLastUpdated).toBe("2026-06-10T00:00:00.000Z");
    expect(result.recentGuidelines.map((item) => item.fileName)).toEqual([
      "IPC.md",
      "MainProcess.md",
      "RendererProcess.md",
    ]);
    expect(result.recentGuidelines[0]?.lastCommitMessage).toHaveLength(80);
  });

  it("falls back to empty governance when git fails", async () => {
    mockSpawnRouter(() => ({ stderr: "fatal: not a git repository", code: 128 }));

    await expect(getGitGovernance("/repo")).resolves.toEqual({
      specsGrowth: [],
      recentGuidelines: [],
      guidelinesLastUpdated: null,
    });
  });

  it("caches git governance results for sixty seconds", async () => {
    let revListIndex = 0;
    const calls = mockSpawnRouter((_command, args) => {
      if (args[0] === "rev-list") {
        revListIndex += 1;
        return { stdout: `sha-${revListIndex}\n` };
      }
      if (args[0] === "ls-tree") {
        return { stdout: "openspec/specs/project-overview\n" };
      }
      return {
        stdout: "2026-06-10T00:00:00.000Z\tdocs(ipc): overview\n" + "guidelines/IPC.md\n",
      };
    });

    const first = await getGitGovernance("/repo");
    const callCountAfterFirstLoad = calls.length;
    const second = await getGitGovernance("/repo");

    expect(second).toBe(first);
    expect(calls).toHaveLength(callCountAfterFirstLoad);
  });
});
