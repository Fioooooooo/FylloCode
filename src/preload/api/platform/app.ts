import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { PlatformAppChannels } from "@shared/ipc/platform/app.channels";
import type { RendererErrorReport } from "@shared/types/app";

export const appApi = {
  openDevTools(): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(PlatformAppChannels.openDevTools, {});
  },

  reportRendererError(report: RendererErrorReport): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(PlatformAppChannels.reportRendererError, report);
  },

  getUserDataPath(): Promise<IpcResponse<string>> {
    return ipcRenderer.invoke(PlatformAppChannels.getUserDataPath);
  },
};
