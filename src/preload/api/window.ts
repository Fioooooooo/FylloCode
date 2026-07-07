import { ipcRenderer } from "electron";
import { WindowChannels } from "@shared/types/channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  OpenFolderWindowResult,
  OpenLauncherWindowResult,
  OpenProjectWindowResult,
  WindowContext,
} from "@shared/types/window";

export const windowApi = {
  getContext(): Promise<IpcResponse<WindowContext>> {
    return ipcRenderer.invoke(WindowChannels.getContext);
  },

  openProject(projectId: string): Promise<IpcResponse<OpenProjectWindowResult>> {
    return ipcRenderer.invoke(WindowChannels.openProject, { projectId });
  },

  openFolder(): Promise<IpcResponse<OpenFolderWindowResult>> {
    return ipcRenderer.invoke(WindowChannels.openFolder);
  },

  openLauncher(): Promise<IpcResponse<OpenLauncherWindowResult>> {
    return ipcRenderer.invoke(WindowChannels.openLauncher);
  },
};
