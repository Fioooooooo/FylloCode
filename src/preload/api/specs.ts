import { ipcRenderer } from "electron";
import { SpecsChannels } from "@shared/types/channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { SpecsBrowserOverview } from "@shared/types/specs";

export const specsApi = {
  getSpecsBrowser(projectId: string): Promise<IpcResponse<SpecsBrowserOverview>> {
    return ipcRenderer.invoke(SpecsChannels.getSpecsBrowser, { projectId });
  },
};
