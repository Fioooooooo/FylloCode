import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateCortexWorkspaceScope } from "@main/migrations/scripts/20260803_001_cortex-workspace-scope";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fyllo-cortex-migration-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function createFolder(folderId: string): Promise<string> {
  const repository = join(root, "repos", folderId);
  await mkdir(repository, { recursive: true });
  await writeJson(join(root, "workspace-folders", folderId, "meta.json"), {
    version: 1,
    id: folderId,
    name: folderId,
    path: repository,
  });
  return repository;
}

async function createWorkspace(
  workspaceId: string,
  folderIds: string[],
  kind: "folder" | "collection" = folderIds.length === 1 ? "folder" : "collection"
): Promise<string> {
  const workspace = join(root, "workspaces", workspaceId);
  await writeJson(join(workspace, "meta.json"), {
    version: 2,
    id: workspaceId,
    kind,
    folderIds,
    primaryFolderId: folderIds[0],
  });
  return workspace;
}

async function createProposalEvidence(
  repository: string,
  changeId: string,
  location: "active" | "archive" | "linked" = "active"
): Promise<void> {
  const changeDir =
    location === "active"
      ? join(repository, "openspec", "changes", changeId)
      : location === "archive"
        ? join(repository, "openspec", "changes", "archive", `2026-08-03-${changeId}`)
        : join(repository, ".worktrees", "proposal-worktree", "openspec", "changes", changeId);
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    join(changeDir, ".openspec.yaml"),
    "schema: spec-driven\nstatus: draft\n",
    "utf8"
  );
}

function ownerlessSubject(changeId: string, extras: Record<string, unknown> = {}): unknown {
  return {
    id: "subject-a",
    customSubjectField: "keep-subject",
    links: [
      {
        sessionId: "session-a",
        customLinkField: "keep-link",
        proposals: [
          {
            changeId,
            createdAt: "2026-08-03T00:00:00.000Z",
            customProposalField: "keep-proposal",
            ...extras,
          },
        ],
      },
    ],
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

const dependencies = () => ({ dataPath: (name: string) => join(root, name) });

describe("cortex Workspace scope migration", () => {
  it("adds the unique Folder owner to legacy knowledge evidence", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    const knowledgePath = join(workspace, "knowledge", "entry.md");
    await mkdir(join(workspace, "knowledge"), { recursive: true });
    await writeFile(
      knowledgePath,
      [
        "---",
        "name: entry",
        "custom: keep",
        "anchors:",
        "  - kind: file",
        "    file: src/a.ts",
        `    hash: ${"a".repeat(64)}`,
        "source:",
        "  kind: commit",
        "  commitHash: abcdef1",
        "---",
        "Body stays.",
        "",
      ].join("\n"),
      "utf8"
    );

    await migrateCortexWorkspaceScope(dependencies());
    const migrated = await readFile(knowledgePath, "utf8");
    expect(migrated).toContain("folderId: folder-a");
    expect(migrated).toContain("custom: keep");
    expect(migrated).toContain("Body stays.");
    await migrateCortexWorkspaceScope(dependencies());
    expect(await readFile(knowledgePath, "utf8")).toBe(migrated);
  });

  it("preserves ambiguous knowledge and records a warning", async () => {
    await createFolder("folder-a");
    await createFolder("folder-b");
    const workspace = await createWorkspace("workspace-a", ["folder-a", "folder-b"]);
    const knowledgePath = join(workspace, "knowledge", "entry.md");
    await mkdir(join(workspace, "knowledge"), { recursive: true });
    const original = [
      "---",
      "name: entry",
      "anchors:",
      "  - kind: file",
      "    file: src/a.ts",
      `    hash: ${"a".repeat(64)}`,
      "---",
      "Body.",
      "",
    ].join("\n");
    await writeFile(knowledgePath, original, "utf8");

    await migrateCortexWorkspaceScope(dependencies());
    expect(await readFile(knowledgePath, "utf8")).toBe(original);
    expect(
      JSON.parse(
        await readFile(join(workspace, "migration-warnings", "cortex-workspace-scope.json"), "utf8")
      )
    ).toMatchObject({ warnings: [{ code: "KNOWLEDGE_OWNER_AMBIGUOUS" }] });
  });

  it("rebuilds owner-qualified Workspace and Folder lineage indexes", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    await writeJson(join(workspace, "lineage", "subjects", "subject-a.json"), {
      id: "subject-a",
      origin: "chat",
      task: null,
      links: [
        {
          sessionId: "session-a",
          createdAt: "2026-08-03T00:00:00.000Z",
          proposals: [
            {
              folderId: "folder-a",
              changeId: "same-change",
              commitHash: "abc123",
              createdAt: "2026-08-03T00:00:00.000Z",
            },
          ],
        },
      ],
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });

    await migrateCortexWorkspaceScope(dependencies());
    const workspaceIndex = JSON.parse(
      await readFile(join(workspace, "lineage", "index.json"), "utf8")
    );
    expect(workspaceIndex).toMatchObject({
      version: 2,
      proposals: { "folder-a\0same-change": "subject-a" },
      commitHashes: { "folder-a\0abc123": "subject-a" },
    });
    const repositoryIndex = JSON.parse(
      await readFile(join(root, "workspace-folders", "folder-a", "lineage", "index.json"), "utf8")
    );
    expect(repositoryIndex.proposals["same-change"]).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-a",
        subjectId: "subject-a",
        relation: "origin",
      }),
    ]);
  });

  it("backfills the unique Folder Workspace owner and rebuilds both lineage indexes", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    await writeJson(subjectPath, ownerlessSubject("legacy-change", { commitHash: "abc123" }));

    await migrateCortexWorkspaceScope(dependencies());
    const migrated = JSON.parse(await readFile(subjectPath, "utf8"));
    expect(migrated).toMatchObject({
      customSubjectField: "keep-subject",
      links: [
        {
          customLinkField: "keep-link",
          proposals: [
            {
              folderId: "folder-a",
              changeId: "legacy-change",
              commitHash: "abc123",
              customProposalField: "keep-proposal",
            },
          ],
        },
      ],
    });
    expect(
      JSON.parse(await readFile(join(workspace, "lineage", "index.json"), "utf8"))
    ).toMatchObject({
      proposals: { "folder-a\0legacy-change": "subject-a" },
      commitHashes: { "folder-a\0abc123": "subject-a" },
    });
    const repositoryIndex = JSON.parse(
      await readFile(join(root, "workspace-folders", "folder-a", "lineage", "index.json"), "utf8")
    );
    expect(repositoryIndex.proposals["legacy-change"]).toEqual([
      expect.objectContaining({ workspaceId: "workspace-a", subjectId: "subject-a" }),
    ]);
    expect(repositoryIndex.commits.abc123).toEqual([
      expect.objectContaining({ workspaceId: "workspace-a", subjectId: "subject-a" }),
    ]);
    await expect(
      readFile(join(workspace, "migration-warnings", "cortex-workspace-scope.json"), "utf8")
    ).rejects.toThrow();
  });

  it.each(["active", "archive", "linked"] as const)(
    "uses unique %s proposal evidence for a Collection Workspace",
    async (location) => {
      await createFolder("folder-a");
      const repositoryB = await createFolder("folder-b");
      await createProposalEvidence(repositoryB, "legacy-change", location);
      const workspace = await createWorkspace(
        "workspace-a",
        ["folder-a", "folder-b"],
        "collection"
      );
      const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
      await writeJson(subjectPath, ownerlessSubject("legacy-change"));

      await migrateCortexWorkspaceScope(dependencies());

      expect(JSON.parse(await readFile(subjectPath, "utf8"))).toMatchObject({
        links: [{ proposals: [{ folderId: "folder-b", changeId: "legacy-change" }] }],
      });
      expect(
        JSON.parse(await readFile(join(workspace, "lineage", "index.json"), "utf8")).proposals
      ).toEqual({ "folder-b\0legacy-change": "subject-a" });
    }
  );

  it.each([
    {
      name: "no repository match",
      prepare: async () => undefined,
      expectedMessage: "no repository evidence matched an available Folder",
    },
    {
      name: "multiple repository matches",
      prepare: async (repositories: string[]) => {
        await Promise.all(
          repositories.map((repository) =>
            createProposalEvidence(repository, "legacy-change", "active")
          )
        );
      },
      expectedMessage: "repository evidence matched multiple available Folders",
    },
  ])("preserves ownerless Collection lineage with $name", async ({ prepare, expectedMessage }) => {
    const repositoryA = await createFolder("folder-a");
    const repositoryB = await createFolder("folder-b");
    await prepare([repositoryA, repositoryB]);
    const workspace = await createWorkspace("workspace-a", ["folder-a", "folder-b"], "collection");
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    const subject = ownerlessSubject("legacy-change");
    await writeJson(subjectPath, subject);

    await migrateCortexWorkspaceScope(dependencies());

    expect(JSON.parse(await readFile(subjectPath, "utf8"))).toEqual(subject);
    expect(
      JSON.parse(await readFile(join(workspace, "lineage", "index.json"), "utf8")).proposals
    ).toEqual({});
    const warnings = JSON.parse(
      await readFile(join(workspace, "migration-warnings", "cortex-workspace-scope.json"), "utf8")
    );
    expect(warnings.warnings).toEqual([
      expect.objectContaining({
        code: "LINEAGE_OWNER_MISSING",
        message: expect.stringContaining(expectedMessage),
      }),
    ]);
  });

  it("does not use the unique Folder member for an unsafe changeId", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    const subject = ownerlessSubject("../unsafe-change");
    await writeJson(subjectPath, subject);

    await migrateCortexWorkspaceScope(dependencies());

    expect(JSON.parse(await readFile(subjectPath, "utf8"))).toEqual(subject);
    const warnings = JSON.parse(
      await readFile(join(workspace, "migration-warnings", "cortex-workspace-scope.json"), "utf8")
    );
    expect(warnings.warnings).toEqual([
      expect.objectContaining({ message: expect.stringContaining("changeId is unsafe") }),
    ]);
  });

  it("ignores unavailable Folder evidence instead of choosing the primary Folder", async () => {
    const repositoryA = await createFolder("folder-a");
    const repositoryB = await createFolder("folder-b");
    await createProposalEvidence(repositoryB, "legacy-change");
    await rm(repositoryB, { recursive: true, force: true });
    const workspace = await createWorkspace("workspace-a", ["folder-a", "folder-b"], "collection");
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    const subject = ownerlessSubject("legacy-change");
    await writeJson(subjectPath, subject);

    await migrateCortexWorkspaceScope(dependencies());

    expect(repositoryA).not.toBe(repositoryB);
    expect(JSON.parse(await readFile(subjectPath, "utf8"))).toEqual(subject);
    const warnings = JSON.parse(
      await readFile(join(workspace, "migration-warnings", "cortex-workspace-scope.json"), "utf8")
    );
    expect(warnings.warnings[0].message).toContain(
      "no repository evidence matched an available Folder"
    );
  });

  it("retains an existing owner without reassigning it from repository evidence", async () => {
    await createFolder("folder-a");
    const repositoryB = await createFolder("folder-b");
    await createProposalEvidence(repositoryB, "legacy-change");
    const workspace = await createWorkspace("workspace-a", ["folder-a", "folder-b"], "collection");
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    const subject = ownerlessSubject("legacy-change", { folderId: "folder-a" });
    await writeJson(subjectPath, subject);

    await migrateCortexWorkspaceScope(dependencies());

    expect(JSON.parse(await readFile(subjectPath, "utf8"))).toEqual(subject);
    expect(
      JSON.parse(await readFile(join(workspace, "lineage", "index.json"), "utf8")).proposals
    ).toEqual({ "folder-a\0legacy-change": "subject-a" });
  });

  it("retains the first stable origin and warns on a conflicting Workspace", async () => {
    await createFolder("folder-a");
    for (const workspaceId of ["workspace-a", "workspace-b"]) {
      const workspace = await createWorkspace(workspaceId, ["folder-a"]);
      await writeJson(join(workspace, "lineage", "subjects", `${workspaceId}.json`), {
        id: `subject-${workspaceId}`,
        links: [
          {
            sessionId: `session-${workspaceId}`,
            proposals: [
              {
                folderId: "folder-a",
                changeId: "same-change",
                createdAt: "2026-08-03T00:00:00.000Z",
              },
            ],
          },
        ],
        updatedAt: "2026-08-03T00:00:00.000Z",
      });
    }

    await migrateCortexWorkspaceScope(dependencies());
    const repositoryIndex = JSON.parse(
      await readFile(join(root, "workspace-folders", "folder-a", "lineage", "index.json"), "utf8")
    );
    expect(repositoryIndex.proposals["same-change"]).toEqual([
      expect.objectContaining({ workspaceId: "workspace-a" }),
    ]);
    const warnings = JSON.parse(
      await readFile(
        join(
          root,
          "workspaces",
          "workspace-b",
          "migration-warnings",
          "cortex-workspace-scope.json"
        ),
        "utf8"
      )
    );
    expect(warnings.warnings).toEqual([
      expect.objectContaining({ code: "LINEAGE_ORIGIN_CONFLICT" }),
    ]);
  });

  it("is idempotent and rebuilds missing indexes from a completed subject", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    await writeJson(subjectPath, ownerlessSubject("legacy-change", { commitHash: "abc123" }));

    await migrateCortexWorkspaceScope(dependencies());
    const migratedSubject = await readFile(subjectPath, "utf8");
    const repositoryIndexPath = join(
      root,
      "workspace-folders",
      "folder-a",
      "lineage",
      "index.json"
    );
    const firstRepositoryIndex = await readFile(repositoryIndexPath, "utf8");

    await migrateCortexWorkspaceScope(dependencies());
    expect(await readFile(subjectPath, "utf8")).toBe(migratedSubject);
    expect(await readFile(repositoryIndexPath, "utf8")).toBe(firstRepositoryIndex);

    await rm(join(workspace, "lineage", "index.json"));
    await rm(repositoryIndexPath);
    await migrateCortexWorkspaceScope(dependencies());

    expect(await readFile(subjectPath, "utf8")).toBe(migratedSubject);
    const workspaceIndex = JSON.parse(
      await readFile(join(workspace, "lineage", "index.json"), "utf8")
    );
    expect(workspaceIndex.proposals).toEqual({
      "folder-a\0legacy-change": "subject-a",
    });
    const rebuiltRepositoryIndex = JSON.parse(await readFile(repositoryIndexPath, "utf8"));
    expect(rebuiltRepositoryIndex.proposals["legacy-change"]).toHaveLength(1);
    expect(rebuiltRepositoryIndex.commits.abc123).toHaveLength(1);
  });

  it("propagates an atomic write failure for the migration ledger", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    await writeJson(join(workspace, "lineage", "subjects", "subject-a.json"), {
      id: "subject-a",
      links: [],
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    await expect(
      migrateCortexWorkspaceScope({
        ...dependencies(),
        writeFileAtomically: async () => {
          throw new Error("disk unavailable");
        },
      })
    ).rejects.toThrow("disk unavailable");
  });
});
