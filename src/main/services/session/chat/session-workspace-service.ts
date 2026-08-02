import { validateSessionWorkspaceSnapshot } from "@main/domain/session/chat/session-workspace-snapshot";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import type { SessionWorkspaceSnapshot, WorkspaceInfo } from "@shared/types/workspace";

export interface SessionWorkspaceServiceDependencies {
  getWorkspaceInfo(workspaceId: string): Promise<WorkspaceInfo>;
}

const defaultDependencies: SessionWorkspaceServiceDependencies = {
  getWorkspaceInfo: getRequiredWorkspaceInfo,
};

export async function assertSessionWorkspaceSnapshotCurrent(
  input: SessionWorkspaceSnapshot,
  dependencies: SessionWorkspaceServiceDependencies = defaultDependencies
): Promise<SessionWorkspaceSnapshot> {
  const snapshot = validateSessionWorkspaceSnapshot(input);
  const workspace = await dependencies.getWorkspaceInfo(snapshot.workspaceId);
  const currentByFolderId = new Map(
    workspace.folders.map((folder) => [folder.folderId, folder] as const)
  );

  for (const folder of snapshot.folders) {
    const current = currentByFolderId.get(folder.folderId);
    if (!current) {
      throw ipcError(
        IpcErrorCodes.SESSION_FOLDER_REMOVED,
        `Session Folder is no longer a member of this Workspace: ${folder.folderName}`,
        {
          workspaceId: snapshot.workspaceId,
          folderId: folder.folderId,
          snapshottedPath: folder.folderPath,
        }
      );
    }

    if (current.folderPath !== folder.folderPath) {
      throw ipcError(
        IpcErrorCodes.SESSION_FOLDER_RELOCATED,
        `Session Folder has moved since this Session was created: ${folder.folderName}`,
        {
          workspaceId: snapshot.workspaceId,
          folderId: folder.folderId,
          snapshottedPath: folder.folderPath,
          currentPath: current.folderPath,
        }
      );
    }

    if (current.pathMissing) {
      throw ipcError(
        IpcErrorCodes.SESSION_FOLDER_PATH_MISSING,
        `Session Folder path is unavailable: ${folder.folderName}`,
        {
          workspaceId: snapshot.workspaceId,
          folderId: folder.folderId,
          snapshottedPath: folder.folderPath,
        }
      );
    }
  }

  return snapshot;
}
