import {
  sessionWorkspaceSnapshotSchema,
  type ResolvedWorkspace,
  type SessionWorkspaceSnapshot,
} from "@shared/types/workspace";

export class SessionWorkspaceSnapshotError extends Error {
  constructor(
    public readonly code: "PRIMARY_MISSING" | "FOLDER_DUPLICATE" | "SNAPSHOT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "SessionWorkspaceSnapshotError";
  }
}

export function validateSessionWorkspaceSnapshot(input: unknown): SessionWorkspaceSnapshot {
  const parsed = sessionWorkspaceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new SessionWorkspaceSnapshotError(
      "SNAPSHOT_INVALID",
      "Session Workspace snapshot is invalid"
    );
  }

  const snapshot = parsed.data;
  const folderIds = snapshot.folders.map((folder) => folder.folderId);
  if (new Set(folderIds).size !== folderIds.length) {
    throw new SessionWorkspaceSnapshotError(
      "FOLDER_DUPLICATE",
      "Session Workspace snapshot contains duplicate Folders"
    );
  }

  const primary = snapshot.folders.filter((folder) => folder.folderId === snapshot.primaryFolderId);
  if (primary.length !== 1) {
    throw new SessionWorkspaceSnapshotError(
      "PRIMARY_MISSING",
      "Session Workspace snapshot must contain exactly one primary Folder"
    );
  }

  const expectedAdditionalDirectories = snapshot.folders
    .filter((folder) => folder.folderId !== snapshot.primaryFolderId)
    .map((folder) => folder.folderPath);
  if (
    primary[0]?.folderPath !== snapshot.cwd ||
    expectedAdditionalDirectories.length !== snapshot.additionalDirectories.length ||
    expectedAdditionalDirectories.some(
      (path, index) => path !== snapshot.additionalDirectories[index]
    )
  ) {
    throw new SessionWorkspaceSnapshotError(
      "SNAPSHOT_INVALID",
      "Session Workspace snapshot directory projection is inconsistent"
    );
  }

  return snapshot;
}

export function createSessionWorkspaceSnapshot(
  workspace: ResolvedWorkspace
): SessionWorkspaceSnapshot {
  const availableFolderIds = workspace.availableFolders.map((folder) => folder.folderId);
  if (new Set(availableFolderIds).size !== availableFolderIds.length) {
    throw new SessionWorkspaceSnapshotError(
      "FOLDER_DUPLICATE",
      "Resolved Workspace contains duplicate available Folders"
    );
  }

  const primary = workspace.availableFolders.filter(
    (folder) => folder.folderId === workspace.primaryFolderId
  );
  if (primary.length !== 1) {
    throw new SessionWorkspaceSnapshotError(
      "PRIMARY_MISSING",
      "Resolved Workspace primary Folder is unavailable"
    );
  }

  return validateSessionWorkspaceSnapshot({
    workspaceId: workspace.workspaceId,
    workspaceKind: workspace.workspaceKind,
    primaryFolderId: workspace.primaryFolderId,
    folders: workspace.availableFolders.map((folder) => ({
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderPath: folder.folderPath,
    })),
    cwd: primary[0]?.folderPath,
    additionalDirectories: workspace.availableFolders
      .filter((folder) => folder.folderId !== workspace.primaryFolderId)
      .map((folder) => folder.folderPath),
  });
}
