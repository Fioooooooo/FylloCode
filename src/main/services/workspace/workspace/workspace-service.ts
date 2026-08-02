import { promises as fs } from "fs";
import { join } from "path";
import { assertWorkspaceRestorable } from "@main/domain/workspace/model";
import { listWorkspaces, loadWorkspace, saveWorkspace } from "@main/infra/storage/workspace-store";
import { loadFolder, saveFolder } from "@main/infra/storage/folder-store";
import { folderDataDir } from "@main/infra/storage/workspace-paths";
import { ipcError } from "@main/ipc/_kit/errors";
import { folderRegistryService } from "@main/services/workspace/folder/folder-registry-service";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { FolderMeta, WorkspaceInfo, WorkspaceMeta } from "@shared/types/workspace";

const workspaceMutationTails = new Map<string, Promise<void>>();

async function withWorkspaceMutation<T>(
  workspaceId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = workspaceMutationTails.get(workspaceId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  workspaceMutationTails.set(workspaceId, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (workspaceMutationTails.get(workspaceId) === queued) {
      workspaceMutationTails.delete(workspaceId);
    }
  }
}

async function pathMissing(path: string): Promise<boolean> {
  try {
    await fs.realpath(path);
    return false;
  } catch {
    return true;
  }
}

async function toWorkspaceInfo(meta: WorkspaceMeta): Promise<WorkspaceInfo> {
  const primaryFolder = await loadFolder(meta.primaryFolderId);
  if (!primaryFolder) {
    throw ipcError(
      IpcErrorCodes.WORKSPACE_NOT_FOUND,
      `Workspace primary Folder is missing: ${meta.id}`
    );
  }
  return {
    ...meta,
    primaryFolder,
    primaryFolderMetaPath: join(folderDataDir(primaryFolder.id), "meta.json"),
    pathMissing: await pathMissing(primaryFolder.path),
  };
}

export async function listWorkspaceInfos(): Promise<WorkspaceInfo[]> {
  const workspaces = await listWorkspaces();
  return Promise.all(
    workspaces
      .filter((workspace) => !workspace.isDeleted)
      .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
      .map(toWorkspaceInfo)
  );
}

export async function getWorkspaceInfo(workspaceId: string): Promise<WorkspaceInfo | null> {
  const workspace = await loadWorkspace(workspaceId);
  if (!workspace || workspace.isDeleted) return null;
  return toWorkspaceInfo(workspace);
}

export async function getRequiredWorkspaceInfo(workspaceId: string): Promise<WorkspaceInfo> {
  const workspace = await getWorkspaceInfo(workspaceId);
  if (!workspace) {
    throw ipcError(IpcErrorCodes.WORKSPACE_NOT_FOUND, `Workspace not found: ${workspaceId}`);
  }
  return workspace;
}

export async function updateWorkspace(input: {
  id: string;
  patch: { name?: string; healthScore?: number };
}): Promise<WorkspaceInfo> {
  return withWorkspaceMutation(input.id, async () => {
    const existing = await loadWorkspace(input.id);
    if (!existing || existing.isDeleted) {
      throw ipcError(IpcErrorCodes.WORKSPACE_NOT_FOUND, `Workspace not found: ${input.id}`);
    }

    if (input.patch.healthScore !== undefined) {
      const primaryFolder = await loadFolder(existing.primaryFolderId);
      if (!primaryFolder) {
        throw ipcError(
          IpcErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace primary Folder is missing: ${existing.id}`
        );
      }
      await saveFolder({ ...primaryFolder, healthScore: input.patch.healthScore });
    }

    const next = {
      ...existing,
      ...(input.patch.name === undefined ? {} : { name: input.patch.name }),
    };
    await saveWorkspace(next);
    return toWorkspaceInfo(next);
  });
}

export async function touchWorkspaceLastOpened(workspaceId: string): Promise<WorkspaceInfo> {
  return withWorkspaceMutation(workspaceId, async () => {
    const existing = await loadWorkspace(workspaceId);
    if (!existing || existing.isDeleted) {
      throw ipcError(IpcErrorCodes.WORKSPACE_NOT_FOUND, `Workspace not found: ${workspaceId}`);
    }
    const next = { ...existing, lastOpenedAt: new Date().toISOString() };
    await saveWorkspace(next);
    return toWorkspaceInfo(next);
  });
}

export async function removeWorkspace(workspaceId: string): Promise<void> {
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

function createFolderWorkspace(folder: FolderMeta, now: string): WorkspaceMeta {
  return {
    version: 2,
    id: folder.id,
    name: folder.name,
    kind: "folder",
    isDeleted: false,
    folderIds: [folder.id],
    primaryFolderId: folder.id,
    createdAt: now,
    lastOpenedAt: now,
  };
}

export async function resolveOrCreateFolderWorkspace(folderPath: string): Promise<WorkspaceInfo> {
  const folder = await folderRegistryService.resolveOrCreateFolder(folderPath);
  return withWorkspaceMutation(folder.id, async () => {
    const existing = await loadWorkspace(folder.id);
    const now = new Date().toISOString();
    let next: WorkspaceMeta;

    if (!existing) {
      next = createFolderWorkspace(folder, now);
    } else if (
      existing.kind !== "folder" ||
      existing.id !== folder.id ||
      existing.folderIds.length !== 1 ||
      existing.folderIds[0] !== folder.id ||
      existing.primaryFolderId !== folder.id
    ) {
      throw ipcError(
        IpcErrorCodes.WORKSPACE_NOT_FOUND,
        `Folder ID is already owned by a non-Folder Workspace: ${folder.id}`
      );
    } else if (existing.isDeleted) {
      assertWorkspaceRestorable(existing);
      const { deletedAt, cleanupState, ...active } = existing;
      void deletedAt;
      void cleanupState;
      next = { ...active, isDeleted: false, lastOpenedAt: now };
    } else {
      next = { ...existing, lastOpenedAt: now };
    }

    await saveWorkspace(next);
    return toWorkspaceInfo(next);
  });
}
