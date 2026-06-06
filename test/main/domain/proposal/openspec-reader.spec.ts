import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import {
  countTasks,
  parseWhySummary,
  parseYamlCreated,
  parseYamlStatus,
  readProposalFiles,
  resolveApplyRunChangeId,
  resolveChangeDir,
  stripArchivePrefix,
  toTitleCase,
} from "@main/domain/proposal/openspec-reader";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      readdir: vi.fn(),
    },
  };
});

type MockDirent = {
  name: string;
  isDirectory: () => boolean;
};

function dirent(name: string, isDirectory = true): MockDirent {
  return {
    name,
    isDirectory: () => isDirectory,
  };
}

function mockFsTree(input: {
  directories?: Record<string, MockDirent[]>;
  files?: Record<string, string>;
}): void {
  const directories = input.directories ?? {};
  const files = input.files ?? {};

  vi.mocked(fs.readdir).mockImplementation(async (targetPath: Parameters<typeof fs.readdir>[0]) => {
    const normalizedPath = String(targetPath);
    const entries = directories[normalizedPath];
    if (!entries) {
      throw new Error(`ENOENT: ${normalizedPath}`);
    }
    return entries as never;
  });

  vi.mocked(fs.readFile).mockImplementation(
    async (targetPath: Parameters<typeof fs.readFile>[0]) => {
      const normalizedPath = String(targetPath);
      const content = files[normalizedPath];
      if (content === undefined) {
        throw new Error(`ENOENT: ${normalizedPath}`);
      }
      return content as never;
    }
  );
}

describe("openspec-reader pure helpers", () => {
  it("stripArchivePrefix removes leading YYYY-MM-DD- only", () => {
    expect(stripArchivePrefix("2026-04-23-foo-bar")).toBe("foo-bar");
    expect(stripArchivePrefix("no-prefix-change")).toBe("no-prefix-change");
  });

  it("toTitleCase splits on dashes and underscores", () => {
    expect(toTitleCase("refactor-main-layering")).toBe("Refactor Main Layering");
    expect(toTitleCase("my_cool_feature")).toBe("My Cool Feature");
    expect(toTitleCase("")).toBe("");
  });

  it("parseYamlStatus recognises known values and falls back to draft", () => {
    expect(parseYamlStatus("status: draft\n")).toBe("draft");
    expect(parseYamlStatus("status: applying\n")).toBe("applying");
    expect(parseYamlStatus("status: archived\n")).toBe("archived");
    expect(parseYamlStatus("foo: bar\n")).toBe("draft");
    expect(parseYamlStatus("status: unknown\n")).toBe("draft");
  });

  it("parseYamlCreated reads the `created:` field when present", () => {
    expect(parseYamlCreated("created: 2026-05-07\n")).toBe("2026-05-07");
    expect(parseYamlCreated("status: draft\n")).toBe("");
  });

  it("parseWhySummary returns first paragraph under ## Why, ignoring bullets", () => {
    const content = [
      "## Proposal",
      "",
      "## Why",
      "",
      "We need a better way.",
      "",
      "- irrelevant bullet",
      "",
      "Second paragraph.",
      "",
      "## What",
      "",
      "ignored",
    ].join("\n");
    expect(parseWhySummary(content)).toBe("We need a better way.");
  });

  it("parseWhySummary truncates very long summaries", () => {
    const long = "x".repeat(400);
    const content = `## Why\n\n${long}\n`;
    const summary = parseWhySummary(content);
    expect(summary.endsWith("...")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(303);
  });

  it("countTasks counts done vs total", () => {
    const content = ["- [x] done 1", "- [x] done 2", "- [ ] pending 1", "- [ ] pending 2"].join(
      "\n"
    );
    expect(countTasks(content)).toEqual({ totalTasks: 4, doneTasks: 2 });
  });

  it("countTasks handles empty content", () => {
    expect(countTasks("no checkboxes here")).toEqual({ totalTasks: 0, doneTasks: 0 });
  });
});

describe("resolveApplyRunChangeId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps an archived proposal id back to the original change id", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("schema: spec-driven");

    await expect(
      resolveApplyRunChangeId("/tmp/project", "2026-05-07-proposal-archived-run-history")
    ).resolves.toBe("proposal-archived-run-history");

    expect(fs.readFile).toHaveBeenCalledWith(
      "/tmp/project/openspec/changes/archive/2026-05-07-proposal-archived-run-history/.openspec.yaml",
      "utf8"
    );
  });

  it("keeps the current change id for non-archived proposals", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("missing"));

    await expect(
      resolveApplyRunChangeId("/tmp/project", "proposal-archived-run-history")
    ).resolves.toBe("proposal-archived-run-history");
  });
});

describe("readProposalFiles", () => {
  const projectPath = "/tmp/project";
  const baseChangesDir = join(projectPath, "openspec", "changes");
  const archiveDir = join(baseChangesDir, "archive");
  const worktreesDir = join(projectPath, ".worktrees");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only main proposals when worktrees directory is absent", async () => {
    const mainChangeDir = join(baseChangesDir, "main-change");
    const archivedChangeDir = join(archiveDir, "2026-05-19-old-change");

    mockFsTree({
      directories: {
        [baseChangesDir]: [dirent("main-change"), dirent("archive")],
        [archiveDir]: [dirent("2026-05-19-old-change")],
      },
      files: {
        [join(mainChangeDir, ".openspec.yaml")]: "status: draft\ncreated: 2026-05-20\n",
        [join(mainChangeDir, "proposal.md")]: "## Why\n\nMain reason\n",
        [join(mainChangeDir, "tasks.md")]: "- [ ] todo\n",
        [join(archivedChangeDir, ".openspec.yaml")]: "status: archived\ncreated: 2026-05-18\n",
        [join(archivedChangeDir, "proposal.md")]: "## Why\n\nArchived reason\n",
        [join(archivedChangeDir, "tasks.md")]: "- [x] done\n",
      },
    });

    await expect(readProposalFiles(projectPath)).resolves.toEqual([
      expect.objectContaining({
        id: "main-change",
        worktreePath: undefined,
        status: "draft",
      }),
      expect.objectContaining({
        id: "2026-05-19-old-change",
        worktreePath: undefined,
        status: "archived",
      }),
    ]);
  });

  it("includes a single worktree proposal with normalized worktreePath", async () => {
    const worktreePath = resolve(worktreesDir, "foo");
    const worktreeChangeDir = join(worktreePath, "openspec", "changes", "foo");

    mockFsTree({
      directories: {
        [baseChangesDir]: [],
        [archiveDir]: [],
        [worktreesDir]: [dirent("foo")],
        [join(worktreePath, "openspec", "changes")]: [dirent("foo")],
      },
      files: {
        [join(worktreeChangeDir, ".openspec.yaml")]: "status: creating\ncreated: 2026-05-20\n",
        [join(worktreeChangeDir, "proposal.md")]: "## Why\n\nWorktree reason\n",
        [join(worktreeChangeDir, "tasks.md")]: "- [ ] todo\n",
      },
    });

    await expect(readProposalFiles(projectPath)).resolves.toEqual([
      expect.objectContaining({
        id: "foo",
        worktreePath,
        status: "creating",
      }),
    ]);
  });

  it("includes multiple worktree proposals with different worktreePath values", async () => {
    const fooWorktreePath = resolve(worktreesDir, "foo");
    const barWorktreePath = resolve(worktreesDir, "bar");

    mockFsTree({
      directories: {
        [baseChangesDir]: [],
        [archiveDir]: [],
        [worktreesDir]: [dirent("foo"), dirent("bar")],
        [join(fooWorktreePath, "openspec", "changes")]: [dirent("change-foo")],
        [join(barWorktreePath, "openspec", "changes")]: [dirent("change-bar")],
      },
      files: {
        [join(fooWorktreePath, "openspec", "changes", "change-foo", ".openspec.yaml")]:
          "status: draft\ncreated: 2026-05-21\n",
        [join(barWorktreePath, "openspec", "changes", "change-bar", ".openspec.yaml")]:
          "status: applying\ncreated: 2026-05-20\n",
      },
    });

    await expect(readProposalFiles(projectPath)).resolves.toEqual([
      expect.objectContaining({ id: "change-foo", worktreePath: fooWorktreePath }),
      expect.objectContaining({ id: "change-bar", worktreePath: barWorktreePath }),
    ]);
  });

  it("deduplicates same active change id with worktree priority", async () => {
    const mainChangeDir = join(baseChangesDir, "foo");
    const worktreePath = resolve(worktreesDir, "foo");
    const worktreeChangeDir = join(worktreePath, "openspec", "changes", "foo");

    mockFsTree({
      directories: {
        [baseChangesDir]: [dirent("foo")],
        [archiveDir]: [],
        [worktreesDir]: [dirent("foo")],
        [join(worktreePath, "openspec", "changes")]: [dirent("foo")],
      },
      files: {
        [join(mainChangeDir, ".openspec.yaml")]: "status: draft\ncreated: 2026-05-20\n",
        [join(mainChangeDir, "proposal.md")]: "## Why\n\nMain reason\n",
        [join(worktreeChangeDir, ".openspec.yaml")]: "status: applying\ncreated: 2026-05-21\n",
        [join(worktreeChangeDir, "proposal.md")]: "## Why\n\nWorktree reason\n",
      },
    });

    const proposals = await readProposalFiles(projectPath);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      id: "foo",
      status: "applying",
      why: "Worktree reason",
      worktreePath,
    });
  });

  it("keeps archive and worktree entries when archive id carries the date prefix", async () => {
    const archivedChangeDir = join(archiveDir, "2026-05-19-foo");
    const worktreePath = resolve(worktreesDir, "foo");
    const worktreeArchiveDir = join(worktreePath, "openspec", "changes", "archive");
    const worktreeChangeDir = join(worktreePath, "openspec", "changes", "foo");

    mockFsTree({
      directories: {
        [baseChangesDir]: [],
        [archiveDir]: [dirent("2026-05-19-foo")],
        [worktreesDir]: [dirent("foo")],
        [join(worktreePath, "openspec", "changes")]: [dirent("foo"), dirent("archive")],
        [worktreeArchiveDir]: [dirent("2026-05-19-foo")],
      },
      files: {
        [join(archivedChangeDir, ".openspec.yaml")]: "status: archived\ncreated: 2026-05-19\n",
        [join(worktreeChangeDir, ".openspec.yaml")]: "status: archived\ncreated: 2026-05-20\n",
      },
    });

    const proposals = await readProposalFiles(projectPath);
    expect(proposals).toEqual([
      expect.objectContaining({ id: "foo", worktreePath }),
      expect.objectContaining({ id: "2026-05-19-foo", worktreePath: undefined }),
    ]);
  });

  it("skips worktree changes without .openspec.yaml", async () => {
    const worktreePath = resolve(worktreesDir, "foo");

    mockFsTree({
      directories: {
        [baseChangesDir]: [],
        [archiveDir]: [],
        [worktreesDir]: [dirent("foo")],
        [join(worktreePath, "openspec", "changes")]: [dirent("foo")],
      },
      files: {},
    });

    await expect(readProposalFiles(projectPath)).resolves.toEqual([]);
  });

  it("normalizes worktreePath when projectPath carries a trailing slash", async () => {
    const projectPathWithSlash = "/tmp/project/";
    const baseChangesDirWithSlash = join(projectPathWithSlash, "openspec", "changes");
    const archiveDirWithSlash = join(baseChangesDirWithSlash, "archive");
    const worktreesDirWithSlash = join(projectPathWithSlash, ".worktrees");
    const worktreePath = resolve(worktreesDirWithSlash, "foo");

    mockFsTree({
      directories: {
        [baseChangesDirWithSlash]: [],
        [archiveDirWithSlash]: [],
        [worktreesDirWithSlash]: [dirent("foo")],
        [join(worktreePath, "openspec", "changes")]: [dirent("foo")],
      },
      files: {
        [join(worktreePath, "openspec", "changes", "foo", ".openspec.yaml")]:
          "status: draft\ncreated: 2026-05-20\n",
      },
    });

    const proposals = await readProposalFiles(projectPathWithSlash);
    expect(proposals[0]?.worktreePath).toBe(resolve("/tmp/project/.worktrees/foo"));
  });
});

describe("resolveChangeDir", () => {
  const projectPath = "/tmp/project";
  const rootDir = join(projectPath, "openspec", "changes", "foo");
  const archiveDir = join(projectPath, "openspec", "changes", "archive", "foo");
  const worktreesDir = join(projectPath, ".worktrees");
  const worktreeDir = join(projectPath, ".worktrees", "foo", "openspec", "changes", "foo");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the main active directory when present", async () => {
    mockFsTree({
      files: {
        [join(rootDir, ".openspec.yaml")]: "status: draft\n",
      },
    });

    await expect(resolveChangeDir(projectPath, "foo")).resolves.toBe(rootDir);
  });

  it("returns the archive directory when main active is missing", async () => {
    mockFsTree({
      files: {
        [join(archiveDir, ".openspec.yaml")]: "status: archived\n",
      },
    });

    await expect(resolveChangeDir(projectPath, "foo")).resolves.toBe(archiveDir);
  });

  it("returns the worktree directory when main and archive both miss", async () => {
    mockFsTree({
      directories: {
        [worktreesDir]: [dirent("foo")],
      },
      files: {
        [join(worktreeDir, ".openspec.yaml")]: "status: draft\n",
      },
    });

    await expect(resolveChangeDir(projectPath, "foo")).resolves.toBe(worktreeDir);
  });

  it("returns null when main, archive, and worktree all miss", async () => {
    mockFsTree({
      directories: {
        [worktreesDir]: [dirent("foo")],
      },
      files: {},
    });

    await expect(resolveChangeDir(projectPath, "foo")).resolves.toBeNull();
  });
});
