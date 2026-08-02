import { describe, expect, it, vi } from "vitest";
import {
  FolderRegistryService,
  type FolderRegistryDependencies,
} from "@main/services/workspace/folder/folder-registry-service";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

function createFixture(initial: FolderMeta[] = [], workspaces: WorkspaceMeta[] = []) {
  const folders = [...initial];
  const canonicalPaths = new Map<string, string>();
  const dependencies: FolderRegistryDependencies = {
    listFolders: vi.fn(async () => [...folders]),
    saveFolder: vi.fn(async (folder) => {
      const index = folders.findIndex((existing) => existing.id === folder.id);
      if (index === -1) folders.push(folder);
      else folders.splice(index, 1, folder);
    }),
    listWorkspaces: vi.fn(async () => workspaces),
    realpath: vi.fn(async (path) => {
      const canonical = canonicalPaths.get(path);
      if (!canonical) throw new Error(`missing: ${path}`);
      return canonical;
    }),
    createId: vi.fn(() => `folder-${folders.length + 1}`),
    inspectReferences: vi.fn(async () => ({ activeReferences: [], historicalSessions: [] })),
  };
  return {
    folders,
    canonicalPaths,
    dependencies,
    service: new FolderRegistryService(dependencies),
  };
}

describe("FolderRegistryService", () => {
  it("creates a path-independent Folder ID and stores the canonical path", async () => {
    const fixture = createFixture();
    fixture.canonicalPaths.set("/alias/repo", "/work/repo");

    await expect(fixture.service.resolveOrCreateFolder("/alias/repo")).resolves.toEqual({
      version: 1,
      id: "folder-1",
      name: "repo",
      path: "/work/repo",
    });
    expect(fixture.dependencies.saveFolder).toHaveBeenCalledOnce();
  });

  it("serializes concurrent resolution of the same canonical path", async () => {
    const fixture = createFixture();
    fixture.canonicalPaths.set("/work/repo", "/work/repo");
    fixture.canonicalPaths.set("/alias/repo", "/work/repo");

    const [first, second] = await Promise.all([
      fixture.service.resolveOrCreateFolder("/work/repo"),
      fixture.service.resolveOrCreateFolder("/alias/repo"),
    ]);

    expect(first.id).toBe(second.id);
    expect(fixture.folders).toHaveLength(1);
    expect(fixture.dependencies.saveFolder).toHaveBeenCalledOnce();
  });

  it("does not index a missing legacy Folder path", async () => {
    const fixture = createFixture([
      { version: 1, id: "legacy-folder", name: "Legacy", path: "/missing/repo" },
    ]);
    fixture.canonicalPaths.set("/work/repo", "/work/repo");

    const resolved = await fixture.service.resolveOrCreateFolder("/work/repo");
    expect(resolved.id).toBe("folder-2");
    expect(fixture.folders).toHaveLength(2);
  });

  it("rejects an already-corrupt canonical path index", async () => {
    const fixture = createFixture([
      { version: 1, id: "folder-1", name: "One", path: "/alias/one" },
      { version: 1, id: "folder-2", name: "Two", path: "/alias/two" },
    ]);
    fixture.canonicalPaths.set("/work/repo", "/work/repo");
    fixture.canonicalPaths.set("/alias/one", "/work/repo");
    fixture.canonicalPaths.set("/alias/two", "/work/repo");

    await expect(fixture.service.resolveOrCreateFolder("/work/repo")).rejects.toMatchObject({
      code: "FOLDER_CANONICAL_PATH_CONFLICT",
    });
    expect(fixture.dependencies.saveFolder).not.toHaveBeenCalled();
  });

  it("returns a structured error for an unavailable requested path", async () => {
    const fixture = createFixture();
    await expect(fixture.service.resolveOrCreateFolder("/missing")).rejects.toMatchObject({
      code: "FOLDER_PATH_UNAVAILABLE",
    });
  });

  it("relocates a missing Folder under the same stable ID", async () => {
    const fixture = createFixture([{ version: 1, id: "folder-1", name: "Repo", path: "/missing" }]);
    fixture.canonicalPaths.set("/new/repo", "/new/repo");

    await expect(fixture.service.relocateFolder("folder-1", "/new/repo")).resolves.toMatchObject({
      id: "folder-1",
      path: "/new/repo",
    });
    expect(fixture.folders).toHaveLength(1);
  });

  it("reports exact and nested relocation conflicts without writing", async () => {
    const collection = workspace({ folderIds: ["folder-1", "folder-2"] });
    const fixture = createFixture(
      [
        { version: 1, id: "folder-1", name: "One", path: "/old" },
        { version: 1, id: "folder-2", name: "Two", path: "/repo" },
        { version: 1, id: "folder-3", name: "Three", path: "/occupied" },
      ],
      [collection]
    );
    for (const path of ["/new", "/repo", "/occupied", "/repo/apps"])
      fixture.canonicalPaths.set(path, path);

    await expect(fixture.service.relocateFolder("folder-1", "/occupied")).rejects.toMatchObject({
      code: "FOLDER_RELOCATION_CONFLICT",
      details: { report: { occupiedByFolder: { folderId: "folder-3" } } },
    });
    await expect(fixture.service.relocateFolder("folder-1", "/repo/apps")).rejects.toMatchObject({
      code: "FOLDER_RELOCATION_CONFLICT",
      details: {
        report: { workspaceConflicts: [{ workspaceId: "workspace-1", relation: "descendant" }] },
      },
    });
    expect(fixture.dependencies.saveFolder).not.toHaveBeenCalled();
  });

  it("blocks active references and requires confirmation for historical Sessions", async () => {
    const fixture = createFixture(
      [{ version: 1, id: "folder-1", name: "One", path: "/old" }],
      [workspace({ folderIds: ["folder-1"] })]
    );
    fixture.canonicalPaths.set("/new", "/new");
    vi.mocked(fixture.dependencies.inspectReferences).mockResolvedValueOnce({
      activeReferences: [{ kind: "chat", workspaceId: "workspace-1", folderId: "folder-1" }],
      historicalSessions: [],
    });
    await expect(fixture.service.relocateFolder("folder-1", "/new")).rejects.toMatchObject({
      code: "FOLDER_RELOCATION_ACTIVE_RUNTIME",
    });

    vi.mocked(fixture.dependencies.inspectReferences).mockResolvedValue({
      activeReferences: [],
      historicalSessions: [
        { workspaceId: "workspace-1", folderId: "folder-1", sessionId: "session-1" },
      ],
    });
    await expect(fixture.service.relocateFolder("folder-1", "/new")).rejects.toMatchObject({
      code: "FOLDER_RELOCATION_CONFIRMATION_REQUIRED",
    });
    await expect(
      fixture.service.relocateFolder("folder-1", "/new", { confirmHistoricalSessions: true })
    ).resolves.toMatchObject({ id: "folder-1", path: "/new" });
  });
});

function workspace(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    version: 2,
    id: "workspace-1",
    name: "Workspace",
    kind: "collection",
    isDeleted: false,
    folderIds: ["folder-1"],
    primaryFolderId: "folder-1",
    createdAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}
