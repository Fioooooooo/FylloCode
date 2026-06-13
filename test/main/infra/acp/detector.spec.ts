import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { rmSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpAgentEntry } from "@shared/types/acp-agent";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return { tempRoot: createTestTempRoot("fyllocode-detector-") };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

function createCommandChild(): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  return child;
}

function mockSpawnOutput(stdout: string, code = 0): void {
  mocks.spawn.mockImplementation(() => {
    const child = createCommandChild();
    queueMicrotask(() => {
      child.stdout.write(stdout);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", code);
    });
    return child;
  });
}

const ORIGINAL_PLATFORM = process.platform;

describe("acp detector command lookup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setPlatform(ORIGINAL_PLATFORM);
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it("uses cross-spawn to locate commands on Windows", async () => {
    setPlatform("win32");
    mockSpawnOutput("C:\\Program Files\\nodejs\\npm\r\nC:\\Program Files\\nodejs\\npm.cmd\r\n");

    const { findCommandPath } = await import("@main/infra/acp/detector");

    await expect(findCommandPath("npm")).resolves.toBe("C:\\Program Files\\nodejs\\npm");
    expect(mocks.spawn).toHaveBeenCalledWith(
      "where",
      ["npm"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("uses the first which match on POSIX", async () => {
    setPlatform("darwin");
    mockSpawnOutput("/opt/homebrew/bin/npm\n/usr/bin/npm\n");

    const { findCommandPath } = await import("@main/infra/acp/detector");

    await expect(findCommandPath("npm")).resolves.toBe("/opt/homebrew/bin/npm");
  });
});

interface SpawnCall {
  command: string;
  args: string[];
}

/** 按命令路由的 spawn mock：记录所有调用并按 (command,args) 返回预置输出 */
function mockSpawnRouter(
  router: (command: string, args: string[]) => { stdout?: string; code?: number }
): SpawnCall[] {
  const calls: SpawnCall[] = [];
  mocks.spawn.mockImplementation((command: string, args: string[]) => {
    calls.push({ command, args });
    const { stdout = "", code = 0 } = router(command, args);
    const child = createCommandChild();
    queueMicrotask(() => {
      child.stdout.write(stdout);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", code);
    });
    return child;
  });
  return calls;
}

function npxAgent(id: string, pkg: string): AcpAgentEntry {
  return {
    id,
    name: id,
    version: "1.0.0",
    description: id,
    authors: [],
    license: "MIT",
    distribution: { npx: { package: pkg } },
  };
}

describe("acp detector batched detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setPlatform("darwin");
    rmSync(tempRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("runs `npm list -g` once without a package name for many npx agents", async () => {
    const installed = {
      dependencies: {
        "@scope/a": { version: "1.0.0", path: "/g/a" },
        "@scope/b": { version: "2.0.0", path: "/g/b" },
      },
    };

    const calls = mockSpawnRouter((command, args) => {
      if (command === "which") {
        return { stdout: `/usr/bin/${args[0]}\n` };
      }
      if (args.includes("list")) {
        return { stdout: JSON.stringify(installed) };
      }
      return { stdout: "" };
    });

    const { detectAgentStatuses } = await import("@main/infra/acp/detector");

    const statuses = await detectAgentStatuses({
      agents: [
        npxAgent("a", "@scope/a"),
        npxAgent("b", "@scope/b"),
        npxAgent("c", "@scope/missing"),
      ],
    });

    const listCalls = calls.filter((call) => call.args.includes("list"));
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0].args).toEqual(["list", "-g", "--depth=0", "--json"]);
    expect(listCalls[0].args).not.toContain("@scope/a");

    const whichNpmCalls = calls.filter(
      (call) => call.command === "which" && call.args[0] === "npm"
    );
    expect(whichNpmCalls).toHaveLength(1);

    expect(statuses.find((status) => status.id === "a")?.installed).toBe(true);
    expect(statuses.find((status) => status.id === "b")?.detectedVersion).toBe("2.0.0");
    expect(statuses.find((status) => status.id === "c")?.installed).toBe(false);
  });
});
