import { nanoid } from "nanoid";
import {
  assertWorkspaceMemberMutationAllowed,
  assertWorkspaceRestorable,
  validateWorkspaceDefinition,
  validateWorkspaceFolderPaths,
} from "@main/domain/workspace/model";
import { loadFolder } from "@main/infra/storage/folder-store";
import { loadWorkspace, saveWorkspace } from "@main/infra/storage/workspace-store";
import { ipcError } from "@main/ipc/_kit/errors";
import { inspectWorkspaceFolderReferences } from "@main/services/workspace/workspace/workspace-reference-inspector";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  CreateCollectionWorkspaceInput,
  FolderMeta,
  UpdateWorkspaceDefinitionInput,
  WorkspaceInfo,
  WorkspaceMeta,
} from "@shared/types/workspace";
import { toWorkspaceInfo, withWorkspaceMutation } from "./workspace-service";

async function loadRequiredFolders(folderIds: readonly string[]): Promise<FolderMeta[]> {
  const folders = await Promise.all(folderIds.map((folderId) => loadFolder(folderId)));
  const missingFolderIds = folderIds.filter((_folderId, index) => folders[index] === null);
  if (missingFolderIds.length > 0) {
    throw ipcError(IpcErrorCodes.FOLDER_NOT_FOUND, "Workspace Folder was not found", {
      missingFolderIds,
    });
  }
  return folders as FolderMeta[];
}

export async function createCollectionWorkspace(
  input: CreateCollectionWorkspaceInput
): Promise<WorkspaceInfo> {
  const id = nanoid();
  const name = input.name.trim();
  validateWorkspaceDefinition({
    id,
    name,
    kind: "collection",
    folderIds: input.folderIds,
    primaryFolderId: input.primaryFolderId,
  });
  const folders = await loadRequiredFolders(input.folderIds);
  validateWorkspaceFolderPaths(folders);
  const now = new Date().toISOString();
  const meta: WorkspaceMeta = {
    version: 2,
    id,
    name,
    kind: "collection",
    isDeleted: false,
    folderIds: [...input.folderIds],
    primaryFolderId: input.primaryFolderId,
    createdAt: now,
    lastOpenedAt: now,
  };
  await saveWorkspace(meta);
  return toWorkspaceInfo(meta);
}

export async function updateWorkspaceDefinition(
  input: UpdateWorkspaceDefinitionInput
): Promise<WorkspaceInfo> {
  return withWorkspaceMutation(input.workspaceId, async () => {
    const existing = await loadWorkspace(input.workspaceId);
    if (!existing || existing.isDeleted) {
      throw ipcError(
        existing?.isDeleted ? IpcErrorCodes.WORKSPACE_DELETED : IpcErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace is not active: ${input.workspaceId}`,
        existing ? { workspaceId: existing.id, cleanupState: existing.cleanupState } : undefined
      );
    }

    const folderIds = input.folderIds ?? existing.folderIds;
    const primaryFolderId = input.primaryFolderId ?? existing.primaryFolderId;
    try {
      assertWorkspaceMemberMutationAllowed(existing, folderIds, primaryFolderId);
    } catch (error) {
      throw ipcError(
        IpcErrorCodes.WORKSPACE_MEMBER_MUTATION_FORBIDDEN,
        error instanceof Error ? error.message : String(error),
        { workspaceId: existing.id }
      );
    }

    const folders = await loadRequiredFolders(folderIds);
    validateWorkspaceFolderPaths(folders);
    const removedFolderIds = existing.folderIds.filter((folderId) => !folderIds.includes(folderId));
    const impacts = await Promise.all(
      removedFolderIds.map((folderId) => inspectWorkspaceFolderReferences(existing.id, folderId))
    );
    const activeReferences = impacts.flatMap((impact) => impact.activeReferences);
    const historicalSessions = impacts.flatMap((impact) => impact.historicalSessions);
    if (activeReferences.length > 0) {
      throw ipcError(
        IpcErrorCodes.WORKSPACE_MEMBER_ACTIVE_REFERENCE,
        "Workspace member is used by active runtime",
        { activeReferences }
      );
    }
    if (historicalSessions.length > 0 && !input.confirmHistoricalSessions) {
      throw ipcError(
        IpcErrorCodes.WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_REQUIRED,
        "Historical Sessions will lose access to removed Workspace members",
        { historicalSessions }
      );
    }

    const next: WorkspaceMeta = {
      ...existing,
      name: input.name?.trim() || existing.name,
      folderIds: [...folderIds],
      primaryFolderId,
    };
    validateWorkspaceDefinition(next);
    await saveWorkspace(next);
    return toWorkspaceInfo(next);
  });
}

export async function softDeleteWorkspace(
  workspaceId: string,
  options: { runtimeStopped: boolean }
): Promise<void> {
  if (!options.runtimeStopped) {
    throw ipcError(
      IpcErrorCodes.WORKSPACE_MEMBER_ACTIVE_REFERENCE,
      "Workspace runtime must be stopped before deletion",
      { workspaceId }
    );
  }
  await withWorkspaceMutation(workspaceId, async () => {
    const existing = await loadWorkspace(workspaceId);
    if (!existing || existing.isDeleted) return;
    await saveWorkspace({
      ...existing,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      cleanupState: "restorable",
    });
  });
}

export async function restoreWorkspace(workspaceId: string): Promise<WorkspaceInfo> {
  return withWorkspaceMutation(workspaceId, async () => {
    const existing = await loadWorkspace(workspaceId);
    if (!existing) {
      throw ipcError(IpcErrorCodes.WORKSPACE_NOT_FOUND, `Workspace not found: ${workspaceId}`);
    }
    try {
      assertWorkspaceRestorable(existing);
    } catch (error) {
      throw ipcError(
        IpcErrorCodes.WORKSPACE_CLEANUP_FAILED,
        error instanceof Error ? error.message : String(error),
        { workspaceId, cleanupState: existing.cleanupState }
      );
    }
    const restored: WorkspaceMeta = { ...existing, isDeleted: false };
    delete restored.deletedAt;
    delete restored.cleanupState;
    await saveWorkspace(restored);
    return toWorkspaceInfo(restored);
  });
}
