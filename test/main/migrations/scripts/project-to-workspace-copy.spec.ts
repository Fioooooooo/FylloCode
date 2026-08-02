import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { encodeProjectPath } from "@main/migrations/legacy-project-path";
import {
  migrateProjectWorkspaceCutover,
  type WorkspaceCutoverDependencies,
} from "@main/migrations/scripts/20260802_001_project-to-workspace";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

const temporaryRoots: string[] = [];
const CREATED_AT = "2026-01-01T00:00:00.000Z";
const LAST_OPENED_AT = "2026-08-02T00:00:00.000Z";

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "fyllocode-workspace-cutover-"));
  temporaryRoots.push(root);
  return root;
}

function legacyProject(id: string, path: string): LegacyProjectMeta {
  return {
    id,
    name: `Project ${id}`,
    path,
    healthScore: 88,
    createdAt: CREATED_AT,
    lastOpenedAt: LAST_OPENED_AT,
  };
}

async function writeFixture(path: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(join(path, ".."), { recursive: true });
  await fs.writeFile(path, content);
}

function createDependencies(
  root: string,
  projects: LegacyProjectMeta[],
  options: {
    workspaces?: Record<string, WorkspaceMeta>;
    folders?: Record<string, FolderMeta>;
  } = {}
): WorkspaceCutoverDependencies {
  const legacyRoot = join(root, "app-data", "projects");
  const workspaceRoot = join(root, "app-data", "workspaces");
  const folderRoot = join(root, "app-data", "workspace-folders");
  return {
    listLegacyProjects: async () => projects,
    loadWorkspace: async (workspaceId) => options.workspaces?.[workspaceId] ?? null,
    loadFolder: async (folderId) => options.folders?.[folderId] ?? null,
    listFolders: async () => Object.values(options.folders ?? {}),
    realpath: (path) => fs.realpath(path),
    legacyProjectsDir: () => legacyRoot,
    workspaceDataDir: (workspaceId) => join(workspaceRoot, workspaceId),
    saveWorkspace: async (meta) => {
      await writeFixture(join(workspaceRoot, meta.id, "meta.json"), JSON.stringify(meta, null, 2));
    },
    saveFolder: async (meta) => {
      await writeFixture(join(folderRoot, meta.id, "meta.json"), JSON.stringify(meta, null, 2));
    },
  };
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path, "utf8")) as Record<string, unknown>;
}

describe("Project-to-Workspace cutover copy", () => {
  it("copies Workspace-owned data, converts identity, and preserves unrelated source data", async () => {
    const root = await temporaryRoot();
    const repositoryPath = join(root, "repositories", "example");
    await fs.mkdir(repositoryPath, { recursive: true });
    const canonicalRepositoryPath = await fs.realpath(repositoryPath);
    const project = legacyProject("stable-id", repositoryPath);
    const candidate = encodeProjectPath(repositoryPath);
    const sourceDir = join(root, "app-data", "projects", candidate);
    const targetDir = join(root, "app-data", "workspaces", project.id);
    const sourceScope = JSON.stringify({ projectId: project.id, retained: "yes" });

    await Promise.all([
      writeFixture(join(sourceDir, "meta.json"), JSON.stringify(project)),
      writeFixture(
        join(sourceDir, "sessions", "session-1.json"),
        JSON.stringify({ sessionId: "session-1", projectId: project.id, custom: 7 })
      ),
      writeFixture(
        join(sourceDir, "sessions", "session-1.messages.jsonl"),
        `${JSON.stringify({ projectId: project.id, text: "hello" })}\n`
      ),
      writeFixture(join(sourceDir, "sessions", "session-1", "plans", "plan.json"), sourceScope),
      writeFixture(
        join(sourceDir, "sessions", "session-1", "attachments", "asset.bin"),
        Buffer.from([0, 1, 2, 255])
      ),
      writeFixture(
        join(sourceDir, "tasks", "tasks.json"),
        JSON.stringify({
          version: 1,
          tasks: [
            {
              id: "task-1",
              projectId: project.id,
              targetFolderIds: ["guessed-folder"],
              title: "Keep fields",
              custom: true,
            },
          ],
        })
      ),
      ...[
        ["workflows", "workflow.json"],
        ["integrations", "config.json"],
        ["knowledge", "entry.json"],
        ["lineage", "subjects", "subject.json"],
        ["apply-runs", "change", "run.json"],
      ].map((parts) => writeFixture(join(sourceDir, ...parts), sourceScope)),
      writeFixture(
        join(sourceDir, "mcp-events", "events.jsonl"),
        `${JSON.stringify({ projectId: project.id, event: "call" })}\n`
      ),
      writeFixture(
        join(sourceDir, "unrelated", "custom.json"),
        JSON.stringify({ projectId: project.id, keepLegacyShape: true })
      ),
      writeFixture(join(sourceDir, "notes.txt"), "unrelated file"),
      writeFixture(join(root, "app-data", "projects", "orphan", "data.bin"), "orphan"),
    ]);

    await migrateProjectWorkspaceCutover(createDependencies(root, [project]));

    const workspace = await readJson(join(targetDir, "meta.json"));
    const folder = await readJson(
      join(root, "app-data", "workspace-folders", project.id, "meta.json")
    );
    expect(workspace).toMatchObject({
      id: project.id,
      kind: "folder",
      legacyAppDataKey: candidate,
      folderIds: [project.id],
      primaryFolderId: project.id,
    });
    expect(folder).toMatchObject({
      id: project.id,
      path: canonicalRepositoryPath,
      healthScore: 88,
    });

    const session = await readJson(join(targetDir, "sessions", "session-1.json"));
    expect(session).toMatchObject({
      workspaceId: project.id,
      custom: 7,
      workspaceSnapshot: {
        workspaceId: project.id,
        workspaceKind: "folder",
        primaryFolderId: project.id,
        folders: [
          {
            folderId: project.id,
            folderName: project.name,
            folderPath: canonicalRepositoryPath,
          },
        ],
        cwd: canonicalRepositoryPath,
        additionalDirectories: [],
      },
    });
    expect(session).not.toHaveProperty("projectId");

    const tasks = await readJson(join(targetDir, "tasks", "tasks.json"));
    expect(tasks.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        workspaceId: project.id,
        custom: true,
      }),
    ]);
    expect((tasks.tasks as Array<Record<string, unknown>>)[0]).not.toHaveProperty("projectId");
    expect((tasks.tasks as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "targetFolderIds"
    );

    for (const parts of [
      ["sessions", "session-1", "plans", "plan.json"],
      ["workflows", "workflow.json"],
      ["integrations", "config.json"],
      ["knowledge", "entry.json"],
      ["lineage", "subjects", "subject.json"],
      ["apply-runs", "change", "run.json"],
    ]) {
      await expect(readJson(join(targetDir, ...parts))).resolves.toMatchObject({
        workspaceId: project.id,
        retained: "yes",
      });
    }

    expect(await fs.readFile(join(targetDir, "sessions", "session-1.messages.jsonl"), "utf8")).toBe(
      `${JSON.stringify({ workspaceId: project.id, text: "hello" })}\n`
    );
    expect(await fs.readFile(join(targetDir, "mcp-events", "events.jsonl"), "utf8")).toBe(
      `${JSON.stringify({ workspaceId: project.id, event: "call" })}\n`
    );
    expect(
      await fs.readFile(join(targetDir, "sessions", "session-1", "attachments", "asset.bin"))
    ).toEqual(Buffer.from([0, 1, 2, 255]));
    await expect(readJson(join(targetDir, "unrelated", "custom.json"))).resolves.toEqual({
      projectId: project.id,
      keepLegacyShape: true,
    });
    await expect(fs.readFile(join(targetDir, "notes.txt"), "utf8")).resolves.toBe("unrelated file");

    await expect(
      fs.readFile(join(sourceDir, "sessions", "session-1.json"), "utf8")
    ).resolves.toContain("projectId");
    await expect(
      fs.readFile(join(root, "app-data", "projects", "orphan", "data.bin"), "utf8")
    ).resolves.toBe("orphan");
  });

  it("copies a shared candidate source independently without assigning provenance", async () => {
    const root = await temporaryRoot();
    const firstPath = join(root, "repositories", "my-app");
    const secondPath = join(root, "repositories", "my", "app");
    await Promise.all([
      fs.mkdir(firstPath, { recursive: true }),
      fs.mkdir(secondPath, { recursive: true }),
    ]);
    const first = legacyProject("first", firstPath);
    const second = legacyProject("second", secondPath);
    const candidate = encodeProjectPath(firstPath);
    expect(encodeProjectPath(secondPath)).toBe(candidate);
    const sourceFile = join(root, "app-data", "projects", candidate, "knowledge", "entry.json");
    await writeFixture(sourceFile, JSON.stringify({ projectId: "first", retained: true }));

    await migrateProjectWorkspaceCutover(createDependencies(root, [first, second]));

    const firstWorkspace = await readJson(
      join(root, "app-data", "workspaces", "first", "meta.json")
    );
    const secondWorkspace = await readJson(
      join(root, "app-data", "workspaces", "second", "meta.json")
    );
    expect(firstWorkspace).not.toHaveProperty("legacyAppDataKey");
    expect(secondWorkspace).not.toHaveProperty("legacyAppDataKey");
    await expect(
      readJson(join(root, "app-data", "workspaces", "first", "knowledge", "entry.json"))
    ).resolves.toMatchObject({ workspaceId: "first", retained: true });
    await expect(
      readJson(join(root, "app-data", "workspaces", "second", "knowledge", "entry.json"))
    ).resolves.toEqual({ workspaceId: "second", retained: true });
    await expect(fs.readFile(sourceFile, "utf8")).resolves.toContain("projectId");
  });

  it("fails the global preflight before writing any non-conflicting target", async () => {
    const root = await temporaryRoot();
    const firstPath = join(root, "repositories", "first");
    const secondPath = join(root, "repositories", "second");
    await Promise.all([
      fs.mkdir(firstPath, { recursive: true }),
      fs.mkdir(secondPath, { recursive: true }),
    ]);
    const first = legacyProject("first", firstPath);
    const second = legacyProject("second", secondPath);
    const firstSource = join(
      root,
      "app-data",
      "projects",
      encodeProjectPath(firstPath),
      "knowledge",
      "entry.json"
    );
    const secondSource = join(
      root,
      "app-data",
      "projects",
      encodeProjectPath(secondPath),
      "knowledge",
      "entry.json"
    );
    await Promise.all([
      writeFixture(firstSource, JSON.stringify({ projectId: "first", value: 1 })),
      writeFixture(secondSource, JSON.stringify({ projectId: "second", value: 2 })),
      writeFixture(
        join(root, "app-data", "workspaces", "second", "knowledge", "entry.json"),
        JSON.stringify({ workspaceId: "second", value: "conflict" })
      ),
    ]);

    await expect(
      migrateProjectWorkspaceCutover(createDependencies(root, [first, second]))
    ).rejects.toMatchObject({
      conflicts: expect.arrayContaining([
        {
          type: "workspace-data-target-content",
          relativePath: join("knowledge", "entry.json"),
          projectId: "second",
        },
      ]),
    });
    await expect(fs.stat(join(root, "app-data", "workspaces", "first"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.stat(join(root, "app-data", "workspace-folders", "first"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
