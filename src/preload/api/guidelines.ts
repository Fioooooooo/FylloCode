import { ipcRenderer } from "electron";
import { GuidelinesChannels } from "@shared/types/channels";
import type { GuidelinesBrowserOverview } from "@shared/types/guidelines";
import type { IpcResponse } from "@shared/types/ipc";

export const guidelinesApi = {
  getBrowser(projectId: string): Promise<IpcResponse<GuidelinesBrowserOverview>> {
    return ipcRenderer.invoke(GuidelinesChannels.getBrowser, { projectId });
  },
};
