import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkspaceIntegrationConfig,
  WorkspaceIntegrationEntry,
} from "@shared/types/integration";

export const workspaceIntegrationApi = {
  getWorkspaceIntegration(workspaceId: string): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return window.api.automation.workspaceIntegration.getWorkspaceIntegration(workspaceId);
  },

  setWorkspaceIntegration(
    workspaceId: string,
    stage: keyof WorkspaceIntegrationConfig,
    resources: WorkspaceIntegrationEntry[]
  ): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return window.api.automation.workspaceIntegration.setWorkspaceIntegration(
      workspaceId,
      stage,
      resources
    );
  },
};
