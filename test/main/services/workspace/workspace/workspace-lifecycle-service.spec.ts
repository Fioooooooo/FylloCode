import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

const mocks = vi.hoisted(() => ({
  loadFolder: vi.fn(),
  loadWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  inspectReferences: vi.fn(),
  toWorkspaceInfo: vi.fn(),
}));

vi.mock("nanoid", () => ({ nanoid: () => "collection-new" }));
vi.mock("@main/infra/storage/folder-store", () => ({ loadFolder: mocks.loadFolder }));
vi.mock("@main/infra/storage/workspace-store", () => ({
  loadWorkspace: mocks.loadWorkspace,
  saveWorkspace: mocks.saveWorkspace,
}));
vi.mock("@main/services/workspace/workspace/workspace-reference-inspector", () => ({
  inspectWorkspaceFolderReferences: mocks.inspectReferences,
}));
vi.mock("@main/services/workspace/workspace/workspace-service", () => ({
  withWorkspaceMutation: vi.fn(async (_id: string, operation: () => unknown) => operation()),
  toWorkspaceInfo: mocks.toWorkspaceInfo,
}));

import {
  createCollectionWorkspace,
  restoreWorkspace,
  softDeleteWorkspace,
  updateWorkspaceDefinition,
} from "@main/services/workspace/workspace/workspace-lifecycle-service";

const folders: Record<string, FolderMeta> = {
  "folder-1": { version: 1, id: "folder-1", name: "One", path: "/one" },
  "folder-2": { version: 1, id: "folder-2", name: "Two", path: "/two" },
};

function workspace(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    version: 2,
    id: "collection-1",
    name: "Collection",
    kind: "collection",
    isDeleted: false,
    folderIds: ["folder-1", "folder-2"],
    primaryFolderId: "folder-1",
    createdAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspace-lifecycle-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadFolder.mockImplementation(async (id: string) => folders[id] ?? null);
    mocks.loadWorkspace.mockResolvedValue(workspace());
    mocks.saveWorkspace.mockResolvedValue(undefined);
    mocks.inspectReferences.mockResolvedValue({ activeReferences: [], historicalSessions: [] });
    mocks.toWorkspaceInfo.mockImplementation(async (meta: WorkspaceMeta) => meta);
  });

  it("creates a single-member Collection atomically without coercing kind", async () => {
    await createCollectionWorkspace({
      name: " One ",
      folderIds: ["folder-1"],
      primaryFolderId: "folder-1",
    });
    expect(mocks.saveWorkspace).toHaveBeenCalledOnce();
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "collection-new",
        name: "One",
        kind: "collection",
        folderIds: ["folder-1"],
      })
    );
  });

  it("does not persist invalid nested Collection members", async () => {
    mocks.loadFolder.mockImplementation(async (id: string) =>
      id === "folder-2" ? { ...folders[id], path: "/one/nested" } : folders[id]
    );
    await expect(
      createCollectionWorkspace({
        name: "Nested",
        folderIds: ["folder-1", "folder-2"],
        primaryFolderId: "folder-1",
      })
    ).rejects.toMatchObject({ code: "WORKSPACE_MEMBER_PATH_NESTED" });
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });

  it("blocks active removal and requires confirmation for historical Sessions", async () => {
    mocks.inspectReferences.mockResolvedValueOnce({
      activeReferences: [{ kind: "chat", workspaceId: "collection-1", folderId: "folder-2" }],
      historicalSessions: [],
    });
    await expect(
      updateWorkspaceDefinition({
        workspaceId: "collection-1",
        folderIds: ["folder-1"],
        primaryFolderId: "folder-1",
      })
    ).rejects.toMatchObject({ code: "WORKSPACE_MEMBER_ACTIVE_REFERENCE" });

    mocks.inspectReferences.mockResolvedValue({
      activeReferences: [],
      historicalSessions: [{ workspaceId: "collection-1", folderId: "folder-2", sessionId: "old" }],
    });
    await expect(
      updateWorkspaceDefinition({
        workspaceId: "collection-1",
        folderIds: ["folder-1"],
        primaryFolderId: "folder-1",
      })
    ).rejects.toMatchObject({ code: "WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_REQUIRED" });
    await updateWorkspaceDefinition({
      workspaceId: "collection-1",
      folderIds: ["folder-1"],
      primaryFolderId: "folder-1",
      confirmHistoricalSessions: true,
    });
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ folderIds: ["folder-1"] })
    );
  });

  it("rejects Folder member mutation while allowing rename", async () => {
    mocks.loadWorkspace.mockResolvedValue(
      workspace({
        id: "folder-1",
        kind: "folder",
        folderIds: ["folder-1"],
        primaryFolderId: "folder-1",
      })
    );
    await expect(
      updateWorkspaceDefinition({ workspaceId: "folder-1", folderIds: ["folder-1", "folder-2"] })
    ).rejects.toMatchObject({ code: "WORKSPACE_MEMBER_MUTATION_FORBIDDEN" });
    await updateWorkspaceDefinition({ workspaceId: "folder-1", name: "Renamed" });
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
  });

  it("requires runtime stop for soft delete and restores only restorable tombstones", async () => {
    await expect(
      softDeleteWorkspace("collection-1", { runtimeStopped: false })
    ).rejects.toMatchObject({
      code: "WORKSPACE_MEMBER_ACTIVE_REFERENCE",
    });
    await softDeleteWorkspace("collection-1", { runtimeStopped: true });
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ isDeleted: true, cleanupState: "restorable" })
    );

    mocks.loadWorkspace.mockResolvedValue(
      workspace({
        isDeleted: true,
        deletedAt: "2026-08-02T01:00:00.000Z",
        cleanupState: "restorable",
      })
    );
    await restoreWorkspace("collection-1");
    expect(mocks.saveWorkspace).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ cleanupState: expect.anything() })
    );
  });
});
