import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { AppChannels } from "@shared/types/channels";
import type { RendererErrorReport } from "@shared/types/app";

export const appApi = {
  openDevTools(): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AppChannels.openDevTools, {});
  },

  reportRendererError(report: RendererErrorReport): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AppChannels.reportRendererError, report);
  },

  getUserDataPath(): Promise<IpcResponse<string>> {
    return ipcRenderer.invoke(AppChannels.getUserDataPath);
  },
};
