import type { ProjectIntegrationConfig } from "@shared/types/integration";
import {
  loadProjectIntegrationConfig,
  setStageResources,
} from "@main/infra/storage/project-integration-store";

export function getProjectIntegration(projectId: string): ProjectIntegrationConfig {
  return loadProjectIntegrationConfig(projectId);
}

export function setProjectIntegrationStage(
  projectId: string,
  stage: keyof ProjectIntegrationConfig,
  resources: ProjectIntegrationConfig[keyof ProjectIntegrationConfig]
): ProjectIntegrationConfig {
  return setStageResources(projectId, stage, resources);
}
