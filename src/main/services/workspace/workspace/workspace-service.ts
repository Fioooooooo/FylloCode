import { promises as fs } from "fs";
import { join } from "path";
import { listWorkspaces, loadWorkspace, saveWorkspace } from "@main/infra/storage/workspace-store";
import { loadFolder, saveFolder } from "@main/infra/storage/folder-store";
import { folderDataDir } from "@main/infra/storage/workspace-paths";
import { ipcError } from "@main/ipc/_kit/errors";
import { folderRegistryService } from "@main/services/workspace/folder/folder-registry-service";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  FolderMeta,
  WorkspaceFolderInfo,
  WorkspaceInfo,
  WorkspaceLauncherItem,
  WorkspaceMeta,
} from "@shared/types/workspace";

const workspaceMutationTails = new Map<string, Promise<void>>();

export async function withWorkspaceMutation<T>(
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

export async function toWorkspaceInfo(meta: WorkspaceMeta): Promise<WorkspaceInfo> {
  const folderMetas = await Promise.all(meta.folderIds.map((folderId) => loadFolder(folderId)));
  if (folderMetas.some((folder) => folder === null)) {
    const missingFolderIds = meta.folderIds.filter(
      (_folderId, index) => folderMetas[index] === null
    );
    throw ipcError(IpcErrorCodes.WORKSPACE_NOT_FOUND, `Workspace members are missing: ${meta.id}`, {
      workspaceId: meta.id,
      missingFolderIds,
    });
  }
  const folders = await Promise.all(
    (folderMetas as FolderMeta[]).map(async (folder): Promise<WorkspaceFolderInfo> => ({
      folderId: folder.id,
      folderName: folder.name,
      folderPath: folder.path,
      pathMissing: await pathMissing(folder.path),
      isPrimary: folder.id === meta.primaryFolderId,
    }))
  );
  const primaryFolder = (folderMetas as FolderMeta[]).find(
    (folder) => folder.id === meta.primaryFolderId
  );
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
    pathMissing:
      folders.find((folder) => folder.folderId === primaryFolder.id)?.pathMissing ?? true,
    folders,
    availableFolders: folders.filter((folder) => !folder.pathMissing),
    missingFolders: folders.filter((folder) => folder.pathMissing),
    chatAvailable: meta.kind === "folder",
  };
}

function toLauncherItem(workspace: WorkspaceInfo): WorkspaceLauncherItem {
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceKind: workspace.kind,
    primaryFolderId: workspace.primaryFolderId,
    primaryFolderPath: workspace.primaryFolder.path,
    folderCount: workspace.folders.length,
    folderPaths: workspace.folders.map((folder) => folder.folderPath),
    folders: workspace.folders,
    missingFolderCount: workspace.missingFolders.length,
    lastOpenedAt: workspace.lastOpenedAt,
    isDeleted: workspace.isDeleted,
    cleanupState: workspace.cleanupState,
    legacyAppDataKey: workspace.legacyAppDataKey,
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

export async function listWorkspaceLauncherItems(): Promise<WorkspaceLauncherItem[]> {
  return (await listWorkspaceInfos()).map(toLauncherItem);
}

export async function listDeletedWorkspaceLauncherItems(): Promise<WorkspaceLauncherItem[]> {
  const workspaces = await listWorkspaces();
  const infos = await Promise.all(
    workspaces
      .filter((workspace) => workspace.isDeleted)
      .sort((left, right) => right.deletedAt!.localeCompare(left.deletedAt!))
      .map(toWorkspaceInfo)
  );
  return infos.map(toLauncherItem);
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
      throw ipcError(IpcErrorCodes.WORKSPACE_DELETED, "Workspace must be restored before opening", {
        workspaceId: existing.id,
        cleanupState: existing.cleanupState,
      });
    } else {
      next = { ...existing, lastOpenedAt: now };
    }

    await saveWorkspace(next);
    return toWorkspaceInfo(next);
  });
}
