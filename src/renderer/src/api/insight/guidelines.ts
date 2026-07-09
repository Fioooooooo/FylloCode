import type { GuidelinesBrowserOverview } from "@shared/types/guidelines";
import type { IpcResponse } from "@shared/types/ipc";

export const guidelinesApi = {
  getBrowser(projectId: string): Promise<IpcResponse<GuidelinesBrowserOverview>> {
    return window.api.insight.guidelines.getBrowser(projectId);
  },
};
