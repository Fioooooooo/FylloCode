import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import {
  integrationCategoryIds,
  type IntegrationStageId,
  type ProjectIntegrationConfig,
} from "@shared/types/integration";

function projectDir(projectId: string): string {
  return join(getDataSubPath("projects"), projectId);
}

export function projectIntegrationPath(projectId: string): string {
  return join(projectDir(projectId), "integrations", "config.json");
}

export function createEmptyProjectIntegrationConfig(): ProjectIntegrationConfig {
  return Object.fromEntries(
    integrationCategoryIds.map((stage) => [stage, [] as ProjectIntegrationConfig[typeof stage]])
  ) as unknown as ProjectIntegrationConfig;
}

function normalizeConfig(
  raw: Partial<ProjectIntegrationConfig> | null | undefined
): ProjectIntegrationConfig {
  const config = createEmptyProjectIntegrationConfig();
  for (const stage of integrationCategoryIds) {
    config[stage] = Array.isArray(raw?.[stage]) ? raw[stage] : [];
  }
  return config;
}

export function loadProjectIntegrationConfig(projectId: string): ProjectIntegrationConfig {
  try {
    const raw = JSON.parse(
      readFileSync(projectIntegrationPath(projectId), "utf8")
    ) as Partial<ProjectIntegrationConfig>;
    return normalizeConfig(raw);
  } catch {
    return createEmptyProjectIntegrationConfig();
  }
}

export function saveProjectIntegrationConfig(
  projectId: string,
  config: ProjectIntegrationConfig
): ProjectIntegrationConfig {
  const normalized = normalizeConfig(config);
  const filePath = projectIntegrationPath(projectId);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function setStageResources(
  projectId: string,
  stage: IntegrationStageId,
  resources: ProjectIntegrationConfig[IntegrationStageId]
): ProjectIntegrationConfig {
  const config = loadProjectIntegrationConfig(projectId);
  config[stage] = resources;
  return saveProjectIntegrationConfig(projectId, config);
}
