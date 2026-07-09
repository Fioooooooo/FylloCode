import type { IpcResponse } from "@shared/types/ipc";
import type { RendererErrorReport } from "@shared/types/app";

export const appApi = {
  openDevTools(): Promise<IpcResponse<void>> {
    return window.api.platform.app.openDevTools();
  },

  reportRendererError(report: RendererErrorReport): Promise<IpcResponse<void>> {
    return window.api.platform.app.reportRendererError(report);
  },

  getUserDataPath(): Promise<IpcResponse<string>> {
    return window.api.platform.app.getUserDataPath();
  },
};
