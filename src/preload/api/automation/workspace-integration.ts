import { ipcRenderer } from "electron";
import { AutomationWorkspaceIntegrationChannels } from "@shared/ipc/automation/workspace-integration.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkspaceIntegrationConfig,
  WorkspaceIntegrationEntry,
} from "@shared/types/integration";

export const workspaceIntegrationApi = {
  getWorkspaceIntegration(workspaceId: string): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return ipcRenderer.invoke(AutomationWorkspaceIntegrationChannels.get, { workspaceId });
  },

  setWorkspaceIntegration(
    workspaceId: string,
    stage: keyof WorkspaceIntegrationConfig,
    resources: WorkspaceIntegrationEntry[]
  ): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return ipcRenderer.invoke(AutomationWorkspaceIntegrationChannels.set, {
      workspaceId,
      stage,
      resources,
    });
  },
};
