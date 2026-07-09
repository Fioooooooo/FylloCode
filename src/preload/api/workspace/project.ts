import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { WorkspaceProjectChannels } from "@shared/ipc/workspace/project.channels";
import type { ProjectInfo } from "@shared/types/project";

export const projectApi = {
  list(): Promise<IpcResponse<ProjectInfo[]>> {
    return ipcRenderer.invoke(WorkspaceProjectChannels.list);
  },

  getById(id: string): Promise<IpcResponse<ProjectInfo | null>> {
    return ipcRenderer.invoke(WorkspaceProjectChannels.getById, { id });
  },

  update(id: string, patch: Partial<ProjectInfo>): Promise<IpcResponse<ProjectInfo>> {
    return ipcRenderer.invoke(WorkspaceProjectChannels.update, { id, patch });
  },

  remove(id: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(WorkspaceProjectChannels.remove, { id });
  },

  openFolder(): Promise<IpcResponse<ProjectInfo | null>> {
    return ipcRenderer.invoke(WorkspaceProjectChannels.openFolder);
  },
};
