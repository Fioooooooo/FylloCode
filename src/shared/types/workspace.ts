import { z } from "zod";

export const workspaceKindSchema = z.enum(["folder", "collection"]);
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;

export const workspaceCleanupStateSchema = z.enum(["restorable", "purging", "cleanup-failed"]);
export type WorkspaceCleanupState = z.infer<typeof workspaceCleanupStateSchema>;

export const folderMetaSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
    healthScore: z.number().finite().optional(),
  })
  .strict();

export type FolderMeta = z.infer<typeof folderMetaSchema>;

export const workspaceMetaSchema = z
  .object({
    version: z.literal(2),
    id: z.string().min(1),
    name: z.string().min(1),
    kind: workspaceKindSchema,
    isDeleted: z.boolean(),
    deletedAt: z.string().datetime().optional(),
    cleanupState: workspaceCleanupStateSchema.optional(),
    legacyAppDataKey: z.string().min(1).optional(),
    folderIds: z.array(z.string().min(1)).min(1).max(16),
    primaryFolderId: z.string().min(1),
    createdAt: z.string().datetime(),
    lastOpenedAt: z.string().datetime(),
  })
  .strict();

export type WorkspaceMeta = z.infer<typeof workspaceMetaSchema>;

export type WorkspaceInfo = WorkspaceMeta & {
  primaryFolder: FolderMeta;
  primaryFolderMetaPath: string;
  pathMissing: boolean;
};

export interface ResolvedWorkspaceFolder {
  folderId: string;
  folderName: string;
  folderPath: string;
  pathMissing: boolean;
}

export interface ResolvedWorkspace {
  workspaceId: string;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  workspaceDataDir: string;
  primaryFolderId: string;
  folders: ResolvedWorkspaceFolder[];
  availableFolders: ResolvedWorkspaceFolder[];
  missingFolders: ResolvedWorkspaceFolder[];
  cwd: string;
  additionalDirectories: string[];
}

export interface ResolvedRepositoryTarget {
  workspaceId: string;
  folderId: string;
  worktreePath: string;
}

export interface SessionWorkspaceFolderSnapshot {
  folderId: string;
  folderName: string;
  folderPath: string;
}

export interface SessionWorkspaceSnapshot {
  workspaceId: string;
  workspaceKind: WorkspaceKind;
  primaryFolderId: string;
  folders: SessionWorkspaceFolderSnapshot[];
  cwd: string;
  additionalDirectories: string[];
}
