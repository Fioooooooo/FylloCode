import type { IpcResponse } from "@shared/types/ipc";
import type {
  OpenFolderWindowResult,
  OpenLauncherWindowResult,
  OpenWorkspaceWindowResult,
  WindowContext,
} from "@shared/types/window";

export const windowApi = {
  getContext(): Promise<IpcResponse<WindowContext>> {
    return window.api.workspace.window.getContext();
  },

  openWorkspace(workspaceId: string): Promise<IpcResponse<OpenWorkspaceWindowResult>> {
    return window.api.workspace.window.openWorkspace(workspaceId);
  },

  openFolder(): Promise<IpcResponse<OpenFolderWindowResult>> {
    return window.api.workspace.window.openFolder();
  },

  openLauncher(): Promise<IpcResponse<OpenLauncherWindowResult>> {
    return window.api.workspace.window.openLauncher();
  },
};
