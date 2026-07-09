import { ipcRenderer } from "electron";
import { WorkspaceWindowChannels } from "@shared/ipc/workspace/window.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  OpenFolderWindowResult,
  OpenLauncherWindowResult,
  OpenProjectWindowResult,
  WindowContext,
} from "@shared/types/window";

export const windowApi = {
  getContext(): Promise<IpcResponse<WindowContext>> {
    return ipcRenderer.invoke(WorkspaceWindowChannels.getContext);
  },

  openProject(projectId: string): Promise<IpcResponse<OpenProjectWindowResult>> {
    return ipcRenderer.invoke(WorkspaceWindowChannels.openProject, { projectId });
  },

  openFolder(): Promise<IpcResponse<OpenFolderWindowResult>> {
    return ipcRenderer.invoke(WorkspaceWindowChannels.openFolder);
  },

  openLauncher(): Promise<IpcResponse<OpenLauncherWindowResult>> {
    return ipcRenderer.invoke(WorkspaceWindowChannels.openLauncher);
  },
};
