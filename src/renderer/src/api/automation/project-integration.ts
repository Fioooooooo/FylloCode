import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectIntegrationConfig, ProjectIntegrationEntry } from "@shared/types/integration";

export const projectIntegrationApi = {
  getProjectIntegration(projectId: string): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return window.api.automation.projectIntegration.getProjectIntegration(projectId);
  },

  setProjectIntegration(
    projectId: string,
    stage: keyof ProjectIntegrationConfig,
    resources: ProjectIntegrationEntry[]
  ): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return window.api.automation.projectIntegration.setProjectIntegration(
      projectId,
      stage,
      resources
    );
  },
};
