import type { IpcResponse } from "@shared/types/ipc";
import type { SpecsBrowserOverview } from "@shared/types/specs";

export const specsApi = {
  getSpecsBrowser(workspaceId: string): Promise<IpcResponse<SpecsBrowserOverview>> {
    return window.api.insight.specs.getSpecsBrowser(workspaceId);
  },
};
