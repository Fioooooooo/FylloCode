import type { IpcResponse } from "@shared/types/ipc";
import type { SpecsBrowserOverview } from "@shared/types/specs";

export const specsApi = {
  getSpecsBrowser(projectId: string): Promise<IpcResponse<SpecsBrowserOverview>> {
    return window.api.specs.getSpecsBrowser(projectId);
  },
};
