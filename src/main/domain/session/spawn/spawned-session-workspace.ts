import { validateSessionWorkspaceSnapshot } from "@main/domain/session/chat/session-workspace-snapshot";
import type { SpawnedSessionScope } from "@shared/types/fyllo-spawn-rpc";
import type {
  SessionWorkspaceFolderSnapshot,
  SessionWorkspaceSnapshot,
} from "@shared/types/workspace";

export type SpawnedSessionWorkspaceErrorCode =
  "UNKNOWN_FOLDER" | "SCOPE_IDENTITY_MISMATCH" | "SCOPE_SNAPSHOT_MISMATCH";

export class SpawnedSessionWorkspaceError extends Error {
  constructor(
    public readonly code: SpawnedSessionWorkspaceErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "SpawnedSessionWorkspaceError";
  }
}

function sameFolder(
  left: SessionWorkspaceFolderSnapshot | undefined,
  right: SessionWorkspaceFolderSnapshot | undefined
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.folderId === right.folderId &&
    left.folderName === right.folderName &&
    left.folderPath === right.folderPath
  );
}

function sameSnapshot(left: SessionWorkspaceSnapshot, right: SessionWorkspaceSnapshot): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.workspaceKind === right.workspaceKind &&
    left.primaryFolderId === right.primaryFolderId &&
    left.cwd === right.cwd &&
    left.additionalDirectories.length === right.additionalDirectories.length &&
    left.additionalDirectories.every(
      (path, index) => path === right.additionalDirectories[index]
    ) &&
    left.folders.length === right.folders.length &&
    left.folders.every((folder, index) => sameFolder(folder, right.folders[index]))
  );
}

export function getSpawnedSessionFolder(
  parentSnapshot: SessionWorkspaceSnapshot,
  folderId: string
): SessionWorkspaceFolderSnapshot {
  const snapshot = validateSessionWorkspaceSnapshot(parentSnapshot);
  const folder = snapshot.folders.find((candidate) => candidate.folderId === folderId);
  if (!folder) {
    throw new SpawnedSessionWorkspaceError(
      "UNKNOWN_FOLDER",
      "The requested Folder is not part of the parent Session Workspace snapshot",
      { folderId, availableFolders: formatAuthorizedFolderList(snapshot) }
    );
  }
  return folder;
}

export function deriveSpawnedSessionWorkspaceSnapshot(
  parentSnapshot: SessionWorkspaceSnapshot,
  folderId?: string
): SessionWorkspaceSnapshot {
  const snapshot = validateSessionWorkspaceSnapshot(parentSnapshot);
  if (folderId === undefined) return snapshot;

  const folder = getSpawnedSessionFolder(snapshot, folderId);
  return validateSessionWorkspaceSnapshot({
    ...snapshot,
    primaryFolderId: folder.folderId,
    folders: [structuredClone(folder)],
    cwd: folder.folderPath,
    additionalDirectories: [],
  });
}

export function assertSpawnedSessionScopeSnapshot(
  parentSnapshot: SessionWorkspaceSnapshot,
  effectiveSnapshot: SessionWorkspaceSnapshot,
  scope: SpawnedSessionScope
): void {
  const parent = validateSessionWorkspaceSnapshot(parentSnapshot);
  const effective = validateSessionWorkspaceSnapshot(effectiveSnapshot);

  if (
    effective.workspaceId !== parent.workspaceId ||
    effective.workspaceKind !== parent.workspaceKind
  ) {
    throw new SpawnedSessionWorkspaceError(
      "SCOPE_IDENTITY_MISMATCH",
      "Spawned Session scope does not belong to the parent Workspace",
      { workspaceId: parent.workspaceId }
    );
  }

  if (scope.kind === "workspace") {
    if (scope.workspaceId !== parent.workspaceId || !sameSnapshot(parent, effective)) {
      throw new SpawnedSessionWorkspaceError(
        "SCOPE_SNAPSHOT_MISMATCH",
        "Workspace-scoped spawned Session snapshot no longer matches its parent snapshot",
        { workspaceId: parent.workspaceId }
      );
    }
    return;
  }

  const parentFolder = parent.folders.find((folder) => folder.folderId === scope.folderId);
  if (!parentFolder) {
    throw new SpawnedSessionWorkspaceError(
      "UNKNOWN_FOLDER",
      "Persisted spawned Session Folder is not part of the parent Workspace snapshot",
      { folderId: scope.folderId, availableFolders: formatAuthorizedFolderList(parent) }
    );
  }

  const effectiveFolder = effective.folders.length === 1 ? effective.folders[0] : undefined;
  if (
    scope.name !== parentFolder.folderName ||
    effective.primaryFolderId !== scope.folderId ||
    !sameFolder(parentFolder, effectiveFolder) ||
    effective.cwd !== parentFolder.folderPath ||
    effective.additionalDirectories.length !== 0
  ) {
    throw new SpawnedSessionWorkspaceError(
      "SCOPE_SNAPSHOT_MISMATCH",
      "Folder-scoped spawned Session snapshot no longer matches its authorized Folder",
      { folderId: scope.folderId }
    );
  }
}

export function formatAuthorizedFolderList(parentSnapshot: SessionWorkspaceSnapshot): string {
  const snapshot = validateSessionWorkspaceSnapshot(parentSnapshot);
  return snapshot.folders.map((folder) => `${folder.folderId} (${folder.folderName})`).join(", ");
}
