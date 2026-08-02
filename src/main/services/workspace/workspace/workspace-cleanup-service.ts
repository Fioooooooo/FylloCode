import {
  deleteLegacyProjectDataByAppDataKey,
  deleteLegacyProjectMetaRecord,
} from "@main/migrations/legacy-project-store";
import {
  deleteWorkspaceDataExceptMeta,
  deleteWorkspaceMeta,
  loadWorkspace,
  saveWorkspace,
} from "@main/infra/storage/workspace-store";
import { deleteWorkspaceWindowState } from "@main/infra/storage/window-state-store";
import { ipcError } from "@main/ipc/_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { WorkspaceCleanupFailure, WorkspaceMeta } from "@shared/types/workspace";
import { withWorkspaceMutation } from "./workspace-service";

export async function permanentlyDeleteWorkspace(workspaceId: string): Promise<void> {
  await withWorkspaceMutation(workspaceId, async () => {
    const existing = await loadWorkspace(workspaceId);
    if (!existing) return;
    if (!existing.isDeleted) {
      throw ipcError(
        IpcErrorCodes.WORKSPACE_CLEANUP_FAILED,
        "Workspace must be soft-deleted before permanent cleanup",
        { workspaceId }
      );
    }

    const purging: WorkspaceMeta = { ...existing, cleanupState: "purging" };
    await saveWorkspace(purging);
    let failureTarget: WorkspaceCleanupFailure["target"] = "workspace-data";
    try {
      await deleteWorkspaceDataExceptMeta(workspaceId);
      failureTarget = "window-state";
      await deleteWorkspaceWindowState(workspaceId);
      if (purging.legacyAppDataKey) {
        failureTarget = "legacy-source";
        await deleteLegacyProjectDataByAppDataKey(purging.legacyAppDataKey);
        failureTarget = "legacy-meta";
        await deleteLegacyProjectMetaRecord(workspaceId);
      }
      failureTarget = "workspace-meta";
      await deleteWorkspaceMeta(workspaceId);
    } catch (error) {
      const failure: WorkspaceCleanupFailure = {
        workspaceId,
        target: failureTarget,
        message: error instanceof Error ? error.message : String(error),
      };
      try {
        await saveWorkspace({ ...purging, cleanupState: "cleanup-failed" });
      } catch {
        // The original cleanup error remains authoritative even if recovery metadata cannot persist.
      }
      throw ipcError(IpcErrorCodes.WORKSPACE_CLEANUP_FAILED, failure.message, { failure });
    }
  });
}
