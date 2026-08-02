import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectOverview } from "@shared/types/overview";

export const overviewApi = {
  getProjectOverview(workspaceId: string): Promise<IpcResponse<ProjectOverview>> {
    return window.api.insight.overview.getProjectOverview(workspaceId);
  },
};
