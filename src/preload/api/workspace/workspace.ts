import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { WorkspaceChannels } from "@shared/ipc/workspace/workspace.channels";
import type { WorkspaceInfo } from "@shared/types/workspace";

export const workspaceApi = {
  list(): Promise<IpcResponse<WorkspaceInfo[]>> {
    return ipcRenderer.invoke(WorkspaceChannels.list);
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

  remove(id: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkspaceChannels.remove, { id });
  },
};
