import { ipcRenderer } from "electron";
import { InsightSpecsChannels } from "@shared/ipc/insight/specs.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { SpecsBrowserOverview } from "@shared/types/specs";

export const specsApi = {
  getSpecsBrowser(projectId: string): Promise<IpcResponse<SpecsBrowserOverview>> {
    return ipcRenderer.invoke(InsightSpecsChannels.getSpecsBrowser, { projectId });
  },
};
