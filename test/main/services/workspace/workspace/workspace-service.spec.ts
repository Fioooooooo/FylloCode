import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  loadWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  loadFolder: vi.fn(),
  saveFolder: vi.fn(),
  resolveOrCreateFolder: vi.fn(),
  realpath: vi.fn(),
}));

vi.mock("@main/infra/storage/workspace-store", () => ({
  listWorkspaces: mocks.listWorkspaces,
  loadWorkspace: mocks.loadWorkspace,
  saveWorkspace: mocks.saveWorkspace,
}));
vi.mock("@main/infra/storage/folder-store", () => ({
  loadFolder: mocks.loadFolder,
  saveFolder: mocks.saveFolder,
}));
vi.mock("@main/services/workspace/folder/folder-registry-service", () => ({
  folderRegistryService: { resolveOrCreateFolder: mocks.resolveOrCreateFolder },
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: { ...actual.promises, realpath: mocks.realpath },
  };
});

import {
  getWorkspaceInfo,
  listWorkspaceInfos,
  removeWorkspace,
  resolveOrCreateFolderWorkspace,
  updateWorkspace,
} from "@main/services/workspace/workspace/workspace-service";

const folder: FolderMeta = {
  version: 1,
  id: "folder-1",
  name: "Folder One",
  path: "/canonical/folder-one",
  healthScore: 80,
};

function workspace(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    version: 2,
    id: "folder-1",
    name: "Workspace One",
    kind: "folder",
    isDeleted: false,
    folderIds: ["folder-1"],
    primaryFolderId: "folder-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspace-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWorkspaces.mockResolvedValue([]);
    mocks.loadWorkspace.mockResolvedValue(workspace());
    mocks.loadFolder.mockResolvedValue(folder);
    mocks.saveWorkspace.mockResolvedValue(undefined);
    mocks.saveFolder.mockResolvedValue(undefined);
    mocks.resolveOrCreateFolder.mockResolvedValue(folder);
    mocks.realpath.mockImplementation(async (path: string) => path);
  });

  it("lists active Workspaces by last-opened time with primary Folder state", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      workspace({ id: "older", folderIds: ["older"], primaryFolderId: "older" }),
      workspace({
        id: "newer",
        folderIds: ["newer"],
        primaryFolderId: "newer",
        lastOpenedAt: "2026-02-01T00:00:00.000Z",
      }),
      workspace({
        id: "deleted",
        folderIds: ["deleted"],
        primaryFolderId: "deleted",
        isDeleted: true,
        deletedAt: "2026-02-02T00:00:00.000Z",
        cleanupState: "restorable",
      }),
    ]);
    mocks.loadFolder.mockImplementation(async (folderId: string) => ({
      ...folder,
      id: folderId,
    }));

    const result = await listWorkspaceInfos();

    expect(result.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result[0]).toMatchObject({
      primaryFolder: { id: "newer" },
      primaryFolderMetaPath: expect.stringMatching(/workspace-folders\/newer\/meta\.json$/),
      pathMissing: false,
    });
  });

  it("returns pathMissing without discarding the registered Folder path", async () => {
    mocks.realpath.mockRejectedValue(new Error("ENOENT"));

    await expect(getWorkspaceInfo("folder-1")).resolves.toMatchObject({
      id: "folder-1",
      primaryFolder: { path: "/canonical/folder-one" },
      pathMissing: true,
    });
  });

  it("updates Workspace name and primary Folder health independently", async () => {
    await updateWorkspace({
      id: "folder-1",
      patch: { name: "Renamed Workspace", healthScore: 42 },
    });

    expect(mocks.saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "folder-1", name: "Renamed Workspace" })
    );
    expect(mocks.saveFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "folder-1", name: "Folder One", healthScore: 42 })
    );
  });

  it("soft-deletes a Workspace without deleting its Folder", async () => {
    await removeWorkspace("folder-1");

    expect(mocks.saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "folder-1",
        isDeleted: true,
        cleanupState: "restorable",
      })
    );
    expect(mocks.saveFolder).not.toHaveBeenCalled();
  });

  it("creates one same-ID Folder Workspace for concurrent canonical opens", async () => {
    let stored: WorkspaceMeta | null = null;
    mocks.loadWorkspace.mockImplementation(async () => stored);
    mocks.saveWorkspace.mockImplementation(async (meta: WorkspaceMeta) => {
      stored = meta;
    });

    const [first, second] = await Promise.all([
      resolveOrCreateFolderWorkspace("/surface/one"),
      resolveOrCreateFolderWorkspace("/surface/two"),
    ]);

    expect(mocks.resolveOrCreateFolder).toHaveBeenCalledTimes(2);
    expect(mocks.saveWorkspace).toHaveBeenCalledTimes(2);
    expect(first.id).toBe("folder-1");
    expect(second.id).toBe("folder-1");
    expect(stored).toMatchObject({
      id: "folder-1",
      kind: "folder",
      folderIds: ["folder-1"],
      primaryFolderId: "folder-1",
    });
  });
});
