import { ipcRenderer } from "electron";
import { AutomationProjectIntegrationChannels } from "@shared/ipc/automation/project-integration.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkspaceIntegrationConfig,
  WorkspaceIntegrationEntry,
} from "@shared/types/integration";

export const projectIntegrationApi = {
  getProjectIntegration(workspaceId: string): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return ipcRenderer.invoke(AutomationProjectIntegrationChannels.get, { workspaceId });
  },

  setProjectIntegration(
    workspaceId: string,
    stage: keyof WorkspaceIntegrationConfig,
    resources: WorkspaceIntegrationEntry[]
  ): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return ipcRenderer.invoke(AutomationProjectIntegrationChannels.set, {
      workspaceId,
      stage,
      resources,
    });
  },
};
