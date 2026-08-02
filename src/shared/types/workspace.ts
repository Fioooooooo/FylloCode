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

export interface WorkspaceFolderInfo {
  folderId: string;
  folderName: string;
  folderPath: string;
  pathMissing: boolean;
  isPrimary: boolean;
}

export type WorkspaceInfo = WorkspaceMeta & {
  primaryFolder: FolderMeta;
  primaryFolderMetaPath: string;
  pathMissing: boolean;
  folders: WorkspaceFolderInfo[];
  availableFolders: WorkspaceFolderInfo[];
  missingFolders: WorkspaceFolderInfo[];
  chatAvailable: boolean;
};

export interface WorkspaceLauncherItem {
  workspaceId: string;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  primaryFolderId: string;
  primaryFolderPath: string;
  folderCount: number;
  folderPaths: string[];
  folders: WorkspaceFolderInfo[];
  missingFolderCount: number;
  lastOpenedAt: string;
  isDeleted: boolean;
  cleanupState?: WorkspaceCleanupState;
  legacyAppDataKey?: string;
}

export interface CreateCollectionWorkspaceInput {
  name: string;
  folderIds: string[];
  primaryFolderId: string;
}

export interface UpdateWorkspaceDefinitionInput {
  workspaceId: string;
  name?: string;
  folderIds?: string[];
  primaryFolderId?: string;
  confirmHistoricalSessions?: boolean;
}

export type WorkspaceRuntimeReferenceKind =
  | "probe"
  | "chat"
  | "proposal-create"
  | "apply"
  | "archive"
  | "proposal-watcher"
  | "pending-action"
  | "preview-dispatch";

export interface WorkspaceRuntimeReference {
  kind: WorkspaceRuntimeReferenceKind;
  workspaceId: string;
  folderId: string;
  sessionId?: string;
  runId?: string;
  changeId?: string;
}

export interface WorkspaceHistoricalSessionReference {
  workspaceId: string;
  folderId: string;
  sessionId: string;
  sessionName?: string;
}

export interface WorkspaceFolderReferenceImpact {
  activeReferences: WorkspaceRuntimeReference[];
  historicalSessions: WorkspaceHistoricalSessionReference[];
}

export type FolderPathRelation = "same" | "ancestor" | "descendant";

export interface FolderRelocationConflictReport {
  folderId: string;
  requestedCanonicalPath: string;
  occupiedByFolder?: {
    folderId: string;
    folderName: string;
    folderPath: string;
  };
  workspaceConflicts: Array<{
    workspaceId: string;
    workspaceName: string;
    conflictingFolderId: string;
    conflictingFolderName: string;
    conflictingFolderPath: string;
    relation: FolderPathRelation;
  }>;
}

export interface WorkspaceCleanupFailure {
  workspaceId: string;
  target: "workspace-data" | "window-state" | "legacy-source" | "legacy-meta" | "workspace-meta";
  message: string;
}

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
