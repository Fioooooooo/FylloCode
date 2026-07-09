import { ipcRenderer } from "electron";
import { InsightGuidelinesChannels } from "@shared/ipc/insight/guidelines.channels";
import type { GuidelinesBrowserOverview } from "@shared/types/guidelines";
import type { IpcResponse } from "@shared/types/ipc";

export const guidelinesApi = {
  getBrowser(projectId: string): Promise<IpcResponse<GuidelinesBrowserOverview>> {
    return ipcRenderer.invoke(InsightGuidelinesChannels.getBrowser, { projectId });
  },
};
