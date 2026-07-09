import { ipcRenderer } from "electron";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectOverview } from "@shared/types/overview";

export const overviewApi = {
  getProjectOverview(projectId: string): Promise<IpcResponse<ProjectOverview>> {
    return ipcRenderer.invoke(InsightOverviewChannels.getProjectOverview, { projectId });
  },
};
