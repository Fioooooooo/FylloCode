import { ipcRenderer } from "electron";
import { AutomationProjectIntegrationChannels } from "@shared/ipc/automation/project-integration.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectIntegrationConfig, ProjectIntegrationEntry } from "@shared/types/integration";

export const projectIntegrationApi = {
  getProjectIntegration(projectId: string): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return ipcRenderer.invoke(AutomationProjectIntegrationChannels.get, { projectId });
  },

  setProjectIntegration(
    projectId: string,
    stage: keyof ProjectIntegrationConfig,
    resources: ProjectIntegrationEntry[]
  ): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return ipcRenderer.invoke(AutomationProjectIntegrationChannels.set, {
      projectId,
      stage,
      resources,
    });
  },
};
