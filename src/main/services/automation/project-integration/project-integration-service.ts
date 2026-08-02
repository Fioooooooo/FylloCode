import type { WorkspaceIntegrationConfig } from "@shared/types/integration";
import {
  loadWorkspaceIntegrationConfig,
  setStageResources,
} from "@main/infra/storage/project-integration-store";

export function getProjectIntegration(workspaceId: string): WorkspaceIntegrationConfig {
  return loadWorkspaceIntegrationConfig(workspaceId);
}

export function setProjectIntegrationStage(
  workspaceId: string,
  stage: keyof WorkspaceIntegrationConfig,
  resources: WorkspaceIntegrationConfig[keyof WorkspaceIntegrationConfig]
): WorkspaceIntegrationConfig {
  return setStageResources(workspaceId, stage, resources);
}
