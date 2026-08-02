import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMeta } from "@shared/types/workspace";

const mocks = vi.hoisted(() => ({
  loadWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  deleteData: vi.fn(),
  deleteMeta: vi.fn(),
  deleteWindowState: vi.fn(),
  deleteLegacyData: vi.fn(),
  deleteLegacyMeta: vi.fn(),
}));

vi.mock("@main/infra/storage/workspace-store", () => ({
  loadWorkspace: mocks.loadWorkspace,
  saveWorkspace: mocks.saveWorkspace,
  deleteWorkspaceDataExceptMeta: mocks.deleteData,
  deleteWorkspaceMeta: mocks.deleteMeta,
}));
vi.mock("@main/infra/storage/window-state-store", () => ({
  deleteWorkspaceWindowState: mocks.deleteWindowState,
}));
vi.mock("@main/migrations/legacy-project-store", () => ({
  deleteLegacyProjectDataByAppDataKey: mocks.deleteLegacyData,
  deleteLegacyProjectMetaRecord: mocks.deleteLegacyMeta,
}));
vi.mock("@main/services/workspace/workspace/workspace-service", () => ({
  withWorkspaceMutation: vi.fn(async (_id: string, operation: () => unknown) => operation()),
}));

import { permanentlyDeleteWorkspace } from "@main/services/workspace/workspace/workspace-cleanup-service";

function tombstone(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    version: 2,
    id: "workspace-1",
    name: "Workspace",
    kind: "folder",
    isDeleted: true,
    deletedAt: "2026-08-02T00:00:00.000Z",
    cleanupState: "restorable",
    folderIds: ["folder-1"],
    primaryFolderId: "folder-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspace-cleanup-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue(tombstone());
    for (const mock of [
      mocks.saveWorkspace,
      mocks.deleteData,
      mocks.deleteMeta,
      mocks.deleteWindowState,
      mocks.deleteLegacyData,
      mocks.deleteLegacyMeta,
    ]) {
      mock.mockResolvedValue(undefined);
    }
  });

  it("persists purging and deletes meta last without guessing legacy sources", async () => {
    const order: string[] = [];
    mocks.saveWorkspace.mockImplementation(async () => order.push("purging"));
    mocks.deleteData.mockImplementation(async () => order.push("data"));
    mocks.deleteWindowState.mockImplementation(async () => order.push("window"));
    mocks.deleteMeta.mockImplementation(async () => order.push("meta"));

    await permanentlyDeleteWorkspace("workspace-1");
    expect(order).toEqual(["purging", "data", "window", "meta"]);
    expect(mocks.deleteLegacyData).not.toHaveBeenCalled();
    expect(mocks.deleteLegacyMeta).not.toHaveBeenCalled();
  });

  it("deletes only provenance-backed legacy data", async () => {
    mocks.loadWorkspace.mockResolvedValue(tombstone({ legacyAppDataKey: "persisted-key" }));
    await permanentlyDeleteWorkspace("workspace-1");
    expect(mocks.deleteLegacyData).toHaveBeenCalledWith("persisted-key");
    expect(mocks.deleteLegacyMeta).toHaveBeenCalledWith("workspace-1");
    expect(mocks.deleteMeta).toHaveBeenCalledWith("workspace-1");
  });

  it("records cleanup-failed and supports idempotent retry", async () => {
    mocks.deleteLegacyData.mockRejectedValueOnce(new Error("permission denied"));
    mocks.loadWorkspace.mockResolvedValue(
      tombstone({ legacyAppDataKey: "persisted-key", cleanupState: "purging" })
    );
    await expect(permanentlyDeleteWorkspace("workspace-1")).rejects.toMatchObject({
      code: "WORKSPACE_CLEANUP_FAILED",
      details: { failure: { target: "legacy-source" } },
    });
    expect(mocks.saveWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ cleanupState: "cleanup-failed" })
    );

    await permanentlyDeleteWorkspace("workspace-1");
    expect(mocks.deleteMeta).toHaveBeenCalled();
  });
});
