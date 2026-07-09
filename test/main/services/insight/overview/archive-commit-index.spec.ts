import { EventEmitter } from "events";
import { promises as fs } from "fs";
import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  readdir: vi.fn(),
  loggerWarn: vi.fn(),
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
      readdir: mocks.readdir,
    },
  };
});

vi.mock("@main/infra/logger", () => ({
  default: {
    warn: mocks.loggerWarn,
  },
}));

import { buildArchiveCommitIndex } from "@main/services/insight/overview/archive-commit-index";

type MockDirent = {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
};

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

function dirent(name: string, kind: "directory" | "file"): MockDirent {
  return {
    name,
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
  };
}

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

describe("overview archive commit index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readdir.mockResolvedValue([]);
  });

  it("maps requested change ids to current archive commit hashes", async () => {
    mocks.readdir.mockResolvedValue([
      dirent("2026-06-14-add-foo", "directory"),
      dirent("2026-06-13-add-foo", "directory"),
      dirent("2026-06-12-add-bar", "directory"),
      dirent("not-an-archive", "directory"),
      dirent("README.md", "file"),
    ]);
    const calls = mockSpawnRouter(() => ({
      stdout: [
        ["COMMIT", "hash-foo", "2026-06-14T12:00:00.000Z"].join("\0"),
        "A\topenspec/changes/archive/2026-06-14-add-foo/.openspec.yaml",
        "",
      ].join("\n"),
    }));

    const index = await buildArchiveCommitIndex("/repo", ["add-foo"]);

    expect(index.get("add-foo")).toEqual({
      changeId: "add-foo",
      archivedChangeId: "2026-06-14-add-foo",
      hash: "hash-foo",
      committedAt: "2026-06-14T12:00:00.000Z",
    });
    expect(index.has("add-bar")).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([
      "log",
      "--diff-filter=A",
      "--format=COMMIT%x00%H%x00%cI",
      "--name-status",
      "--",
      "openspec/changes/archive/2026-06-14-add-foo/.openspec.yaml",
    ]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "[overview] multiple archived changes found for change=add-foo; using 2026-06-14-add-foo"
    );
  });

  it("returns an empty index when the anchor file is not committed", async () => {
    mocks.readdir.mockResolvedValue([dirent("2026-06-14-add-foo", "directory")]);
    mockSpawnRouter(() => ({ stdout: "" }));

    const index = await buildArchiveCommitIndex("/repo", ["add-foo"]);

    expect(index.size).toBe(0);
  });

  it("falls back to an empty index when git fails", async () => {
    mocks.readdir.mockResolvedValue([dirent("2026-06-14-add-foo", "directory")]);
    mockSpawnRouter(() => ({ stderr: "fatal: not a git repository", code: 128 }));

    const index = await buildArchiveCommitIndex("/repo", ["add-foo"]);

    expect(index.size).toBe(0);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "[overview] failed to build archive commit index",
      expect.any(Error)
    );
  });

  it("does not spawn git when no requested changes have archived directories", async () => {
    mocks.readdir.mockResolvedValue([dirent("2026-06-12-add-bar", "directory")]);

    const index = await buildArchiveCommitIndex("/repo", ["add-foo"]);

    expect(index.size).toBe(0);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(fs.readdir).toHaveBeenCalledWith("/repo/openspec/changes/archive", {
      withFileTypes: true,
    });
  });
});
