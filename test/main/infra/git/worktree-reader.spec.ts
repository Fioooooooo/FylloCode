import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { promises as fs } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestTempRoot } from "@test/main/test-temp-root";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

const tempRoot = createTestTempRoot("fyllocode-worktree-reader-");

function mockGit(stdout: string, code = 0): void {
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stdout.end(stdout);
      child.stderr.end(code === 0 ? "" : "failed");
      child.emit("close", code);
    });
    return child;
  });
}

describe("listRegisteredWorktreePaths", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.mkdir(`${tempRoot}/main`, { recursive: true });
    await fs.mkdir(`${tempRoot}/linked`, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("returns canonical main and linked worktree paths", async () => {
    mockGit(`worktree ${tempRoot}/main\nHEAD abc\n\nworktree ${tempRoot}/linked\nHEAD def\n`);
    const { listRegisteredWorktreePaths } = await import("@main/infra/git/worktree-reader");

    const result = await listRegisteredWorktreePaths(`${tempRoot}/main`);

    expect(result).toEqual({
      paths: [await fs.realpath(`${tempRoot}/main`), await fs.realpath(`${tempRoot}/linked`)],
    });
    expect(mocks.spawn).toHaveBeenCalledWith(
      "git",
      ["-C", `${tempRoot}/main`, "worktree", "list", "--porcelain"],
      { stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" }
    );
  });

  it("returns an empty list for empty output", async () => {
    mockGit("");
    const { listRegisteredWorktreePaths } = await import("@main/infra/git/worktree-reader");

    await expect(listRegisteredWorktreePaths(`${tempRoot}/main`)).resolves.toEqual({
      paths: [],
    });
  });

  it("fails closed when git exits unsuccessfully", async () => {
    mockGit("", 1);
    const { listRegisteredWorktreePaths } = await import("@main/infra/git/worktree-reader");

    const result = await listRegisteredWorktreePaths(`${tempRoot}/main`);

    expect(result.paths).toEqual([]);
    expect(result.warning).toBe("failed");
  });
});
