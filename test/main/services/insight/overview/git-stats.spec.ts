import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: mocks.stat,
    },
  };
});

import {
  clearGitStatsCache,
  computeRecentGuidelines,
  computeSpecsGrowth,
  getGitHistoryAvailability,
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

function fileSystemError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe("overview git stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00.000Z"));
    clearGitStatsCache();
    mocks.stat.mockResolvedValue({ isDirectory: () => true, isFile: () => false });
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

  it("propagates git failures so the Folder aggregate can mark an error", async () => {
    mockSpawnRouter(() => ({ stderr: "fatal: not a git repository", code: 128 }));

    await expect(getGitGovernance("/repo")).rejects.toThrow("fatal: not a git repository");
  });

  it("returns uncached defaults for an ordinary non-Git Project", async () => {
    mocks.stat.mockRejectedValue(fileSystemError("ENOENT"));

    const first = await getGitGovernance("/repo");
    const second = await getGitGovernance("/repo");

    expect(first).toEqual({
      specsGrowth: [],
      recentGuidelines: [],
      guidelinesLastUpdated: null,
    });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(mocks.stat).toHaveBeenCalledTimes(2);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("returns uncached defaults for a Git Project without a first commit", async () => {
    const calls = mockSpawnRouter((_command, args) => {
      expect(args).toEqual(["rev-parse", "--verify", "--quiet", "HEAD"]);
      return { code: 1 };
    });

    const first = await getGitGovernance("/repo");
    const second = await getGitGovernance("/repo");

    expect(first).toEqual({
      specsGrowth: [],
      recentGuidelines: [],
      guidelinesLastUpdated: null,
    });
    expect(second).not.toBe(first);
    expect(calls).toHaveLength(2);
  });

  it("recognizes linked worktree Git metadata files and an available HEAD", async () => {
    mocks.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true });
    const calls = mockSpawnRouter((_command, args) => {
      if (args[0] === "rev-parse") return { stdout: "head-sha\n" };
      return { stdout: "" };
    });

    await expect(getGitHistoryAvailability("/linked-worktree")).resolves.toBe("available");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["rev-parse", "--verify", "--quiet", "HEAD"]);
  });

  it("does not hide Git metadata permission failures", async () => {
    mocks.stat.mockRejectedValue(fileSystemError("EACCES"));

    await expect(getGitHistoryAvailability("/repo")).rejects.toMatchObject({ code: "EACCES" });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("does not hide Git process startup failures", async () => {
    mocks.spawn.mockImplementation(() => {
      const child = createChild();
      queueMicrotask(() => child.emit("error", new Error("spawn failed")));
      return child;
    });

    await expect(getGitHistoryAvailability("/repo")).rejects.toThrow("spawn failed");
  });

  it("does not hide Git probe timeouts", async () => {
    mocks.spawn.mockImplementation(() => createChild());

    const result = getGitHistoryAvailability("/repo");
    const assertion = expect(result).rejects.toThrow(
      "git rev-parse --verify --quiet HEAD timed out after 10000ms"
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("caches git governance results for sixty seconds", async () => {
    let revListIndex = 0;
    const calls = mockSpawnRouter((_command, args) => {
      if (args[0] === "rev-parse") {
        return { stdout: "head-sha\n" };
      }
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
    expect(mocks.stat).toHaveBeenCalledTimes(1);
  });
});
