import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateCollectionWorkspaceInput,
  FolderMeta,
  UpdateWorkspaceDefinitionInput,
  WorkspaceInfo,
  WorkspaceLauncherItem,
} from "@shared/types/workspace";

export const workspaceApi = {
  list(): Promise<IpcResponse<WorkspaceLauncherItem[]>> {
    return window.api.workspace.workspace.list();
  },

  listDeleted(): Promise<IpcResponse<WorkspaceLauncherItem[]>> {
    return window.api.workspace.workspace.listDeleted();
  },

  getById(id: string): Promise<IpcResponse<WorkspaceInfo | null>> {
    return window.api.workspace.workspace.getById(id);
  },

  update(
    id: string,
    patch: { name?: string; healthScore?: number }
  ): Promise<IpcResponse<WorkspaceInfo>> {
    return window.api.workspace.workspace.update(id, patch);
  },

  selectFolder(): Promise<IpcResponse<FolderMeta | null>> {
    return window.api.workspace.workspace.selectFolder();
  },

  createCollection(input: CreateCollectionWorkspaceInput): Promise<IpcResponse<WorkspaceInfo>> {
    return window.api.workspace.workspace.createCollection(input);
  },

  updateDefinition(input: UpdateWorkspaceDefinitionInput): Promise<IpcResponse<WorkspaceInfo>> {
    return window.api.workspace.workspace.updateDefinition(input);
  },

  softDelete(workspaceId: string): Promise<IpcResponse<void>> {
    return window.api.workspace.workspace.softDelete(workspaceId);
  },

  restore(workspaceId: string): Promise<IpcResponse<WorkspaceInfo>> {
    return window.api.workspace.workspace.restore(workspaceId);
  },

  permanentlyDelete(workspaceId: string): Promise<IpcResponse<void>> {
    return window.api.workspace.workspace.permanentlyDelete(workspaceId);
  },

  relocateFolder(
    folderId: string,
    confirmHistoricalSessions = false
  ): Promise<IpcResponse<FolderMeta | null>> {
    return window.api.workspace.workspace.relocateFolder(folderId, confirmHistoricalSessions);
  },

  remove(id: string): Promise<IpcResponse<void>> {
    return window.api.workspace.workspace.remove(id);
  },
};
