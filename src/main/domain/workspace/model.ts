import {
  folderMetaSchema,
  workspaceMetaSchema,
  type FolderMeta,
  type WorkspaceMeta,
} from "@shared/types/workspace";

export type WorkspaceModelErrorCode =
  | "FOLDER_META_INVALID"
  | "WORKSPACE_META_INVALID"
  | "WORKSPACE_MEMBER_DUPLICATE"
  | "WORKSPACE_PRIMARY_FOLDER_INVALID"
  | "WORKSPACE_FOLDER_SHAPE_INVALID"
  | "WORKSPACE_TOMBSTONE_INVALID"
  | "WORKSPACE_NOT_RESTORABLE"
  | "WORKSPACE_MEMBER_PATH_DUPLICATE"
  | "WORKSPACE_MEMBER_PATH_NESTED";

export class WorkspaceModelError extends Error {
  constructor(
    public readonly code: WorkspaceModelErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "WorkspaceModelError";
  }
}

export function validateFolderMeta(input: unknown): FolderMeta {
  const result = folderMetaSchema.safeParse(input);
  if (!result.success) {
    throw new WorkspaceModelError("FOLDER_META_INVALID", "Folder metadata is invalid", {
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function validateWorkspaceMeta(input: unknown): WorkspaceMeta {
  const result = workspaceMetaSchema.safeParse(input);
  if (!result.success) {
    throw new WorkspaceModelError("WORKSPACE_META_INVALID", "Workspace metadata is invalid", {
      issues: result.error.issues,
    });
  }

  const meta = result.data;
  const uniqueFolderIds = new Set(meta.folderIds);
  if (uniqueFolderIds.size !== meta.folderIds.length) {
    throw new WorkspaceModelError(
      "WORKSPACE_MEMBER_DUPLICATE",
      "Workspace members must have unique Folder IDs",
      { workspaceId: meta.id, folderIds: meta.folderIds }
    );
  }

  if (
    meta.kind === "folder" &&
    (meta.folderIds.length !== 1 ||
      meta.folderIds[0] !== meta.id ||
      meta.primaryFolderId !== meta.id)
  ) {
    throw new WorkspaceModelError(
      "WORKSPACE_FOLDER_SHAPE_INVALID",
      "Folder Workspace must use the same ID for Workspace, member, and primary Folder",
      {
        workspaceId: meta.id,
        folderIds: meta.folderIds,
        primaryFolderId: meta.primaryFolderId,
      }
    );
  }

  if (!uniqueFolderIds.has(meta.primaryFolderId)) {
    throw new WorkspaceModelError(
      "WORKSPACE_PRIMARY_FOLDER_INVALID",
      "Workspace primary Folder must be a member",
      { workspaceId: meta.id, primaryFolderId: meta.primaryFolderId }
    );
  }

  if (
    (!meta.isDeleted && (meta.deletedAt !== undefined || meta.cleanupState !== undefined)) ||
    (meta.isDeleted && (meta.deletedAt === undefined || meta.cleanupState === undefined))
  ) {
    throw new WorkspaceModelError(
      "WORKSPACE_TOMBSTONE_INVALID",
      "Workspace deletion fields do not match its tombstone state",
      {
        workspaceId: meta.id,
        isDeleted: meta.isDeleted,
        deletedAt: meta.deletedAt,
        cleanupState: meta.cleanupState,
      }
    );
  }

  return meta;
}

export function assertWorkspaceRestorable(meta: WorkspaceMeta): void {
  if (!meta.isDeleted || meta.cleanupState !== "restorable") {
    throw new WorkspaceModelError(
      "WORKSPACE_NOT_RESTORABLE",
      "Only a restorable Workspace tombstone can be restored",
      { workspaceId: meta.id, cleanupState: meta.cleanupState }
    );
  }
}

function comparablePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.length > 0 ? normalized : "/";
}

export function validateWorkspaceFolderPaths(folders: readonly FolderMeta[]): void {
  const seen = new Map<string, string>();
  const comparable = folders.map((folder) => ({
    folder,
    path: comparablePath(folder.path),
  }));

  for (const entry of comparable) {
    const existingFolderId = seen.get(entry.path);
    if (existingFolderId !== undefined) {
      throw new WorkspaceModelError(
        "WORKSPACE_MEMBER_PATH_DUPLICATE",
        "Workspace members cannot resolve to the same canonical path",
        {
          folderIds: [existingFolderId, entry.folder.id],
          path: entry.path,
        }
      );
    }
    seen.set(entry.path, entry.folder.id);
  }

  for (let index = 0; index < comparable.length; index += 1) {
    for (let candidateIndex = index + 1; candidateIndex < comparable.length; candidateIndex += 1) {
      const left = comparable[index];
      const right = comparable[candidateIndex];
      if (left === undefined || right === undefined) continue;

      const leftContainsRight = right.path.startsWith(`${left.path}/`);
      const rightContainsLeft = left.path.startsWith(`${right.path}/`);
      if (leftContainsRight || rightContainsLeft) {
        throw new WorkspaceModelError(
          "WORKSPACE_MEMBER_PATH_NESTED",
          "Workspace member paths cannot contain one another",
          {
            folderIds: [left.folder.id, right.folder.id],
            paths: [left.path, right.path],
          }
        );
      }
    }
  }
}
