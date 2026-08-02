import type { IpcResponse } from "@shared/types/ipc";
import type {
  WorkspaceIntegrationConfig,
  WorkspaceIntegrationEntry,
} from "@shared/types/integration";

export const projectIntegrationApi = {
  getProjectIntegration(workspaceId: string): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return window.api.automation.projectIntegration.getProjectIntegration(workspaceId);
  },

  setProjectIntegration(
    workspaceId: string,
    stage: keyof WorkspaceIntegrationConfig,
    resources: WorkspaceIntegrationEntry[]
  ): Promise<IpcResponse<WorkspaceIntegrationConfig>> {
    return window.api.automation.projectIntegration.setProjectIntegration(
      workspaceId,
      stage,
      resources
    );
  },
};
