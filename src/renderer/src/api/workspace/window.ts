import type { IpcResponse } from "@shared/types/ipc";
import type {
  OpenFolderWindowResult,
  OpenLauncherWindowResult,
  OpenProjectWindowResult,
  WindowContext,
} from "@shared/types/window";

export const windowApi = {
  getContext(): Promise<IpcResponse<WindowContext>> {
    return window.api.workspace.window.getContext();
  },

  openProject(projectId: string): Promise<IpcResponse<OpenProjectWindowResult>> {
    return window.api.workspace.window.openProject(projectId);
  },

  openFolder(): Promise<IpcResponse<OpenFolderWindowResult>> {
    return window.api.workspace.window.openFolder();
  },

  openLauncher(): Promise<IpcResponse<OpenLauncherWindowResult>> {
    return window.api.workspace.window.openLauncher();
  },
};
