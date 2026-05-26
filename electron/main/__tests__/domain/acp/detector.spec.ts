import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
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

    const { findCommandPath } = await import("@main/domain/acp/detector");

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

    const { findCommandPath } = await import("@main/domain/acp/detector");

    await expect(findCommandPath("npm")).resolves.toBe("/opt/homebrew/bin/npm");
  });
});
