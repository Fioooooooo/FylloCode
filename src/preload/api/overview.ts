import { ipcRenderer } from "electron";
import { OverviewChannels } from "@shared/types/channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectOverview } from "@shared/types/overview";

export const overviewApi = {
  getProjectOverview(projectId: string): Promise<IpcResponse<ProjectOverview>> {
    return ipcRenderer.invoke(OverviewChannels.getProjectOverview, { projectId });
  },
};
