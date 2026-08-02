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

async function createWorkspace(workspaceId: string, folderIds: string[]): Promise<string> {
  const workspace = join(root, "workspaces", workspaceId);
  await writeJson(join(workspace, "meta.json"), {
    version: 2,
    id: workspaceId,
    folderIds,
    primaryFolderId: folderIds[0],
  });
  return workspace;
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

  it("keeps ownerless lineage out of v2 indexes and preserves the subject", async () => {
    await createFolder("folder-a");
    const workspace = await createWorkspace("workspace-a", ["folder-a"]);
    const subjectPath = join(workspace, "lineage", "subjects", "subject-a.json");
    const subject = {
      id: "subject-a",
      links: [
        {
          sessionId: "session-a",
          proposals: [{ changeId: "legacy-change", createdAt: "2026-08-03T00:00:00.000Z" }],
        },
      ],
      updatedAt: "2026-08-03T00:00:00.000Z",
    };
    await writeJson(subjectPath, subject);

    await migrateCortexWorkspaceScope(dependencies());
    expect(JSON.parse(await readFile(subjectPath, "utf8"))).toEqual(subject);
    const index = JSON.parse(await readFile(join(workspace, "lineage", "index.json"), "utf8"));
    expect(index.proposals).toEqual({});
    const warnings = JSON.parse(
      await readFile(join(workspace, "migration-warnings", "cortex-workspace-scope.json"), "utf8")
    );
    expect(warnings.warnings).toEqual([expect.objectContaining({ code: "LINEAGE_OWNER_MISSING" })]);
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
