import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";
import type {
  CreateCollectionWorkspaceInput,
  FolderMeta,
  UpdateWorkspaceDefinitionInput,
  WorkspaceInfo,
  WorkspaceLauncherItem,
} from "@shared/types/workspace";

export const workspaceApi = {
  list(): Promise<IpcResponse<WorkspaceLauncherItem[]>> {
    return ipcRenderer.invoke(WorkspaceChannels.list);
  },

  listDeleted(): Promise<IpcResponse<WorkspaceLauncherItem[]>> {
    return ipcRenderer.invoke(WorkspaceChannels.listDeleted);
  },

  getById(id: string): Promise<IpcResponse<WorkspaceInfo | null>> {
    return ipcRenderer.invoke(WorkspaceChannels.getById, { id });
  },

  update(
    id: string,
    patch: { name?: string; healthScore?: number }
  ): Promise<IpcResponse<WorkspaceInfo>> {
    return ipcRenderer.invoke(WorkspaceChannels.update, { id, patch });
  },

  selectFolder(): Promise<IpcResponse<FolderMeta | null>> {
    return ipcRenderer.invoke(WorkspaceChannels.selectFolder);
  },

  createCollection(input: CreateCollectionWorkspaceInput): Promise<IpcResponse<WorkspaceInfo>> {
    return ipcRenderer.invoke(WorkspaceChannels.createCollection, input);
  },

  updateDefinition(input: UpdateWorkspaceDefinitionInput): Promise<IpcResponse<WorkspaceInfo>> {
    return ipcRenderer.invoke(WorkspaceChannels.updateDefinition, input);
  },

  softDelete(workspaceId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkspaceChannels.softDelete, { workspaceId });
  },

  restore(workspaceId: string): Promise<IpcResponse<WorkspaceInfo>> {
    return ipcRenderer.invoke(WorkspaceChannels.restore, { workspaceId });
  },

  permanentlyDelete(workspaceId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkspaceChannels.permanentlyDelete, { workspaceId });
  },

  relocateFolder(
    folderId: string,
    confirmHistoricalSessions = false
  ): Promise<IpcResponse<FolderMeta | null>> {
    return ipcRenderer.invoke(WorkspaceChannels.relocateFolder, {
      folderId,
      confirmHistoricalSessions,
    });
  },

  remove(id: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkspaceChannels.remove, { id });
  },
};
