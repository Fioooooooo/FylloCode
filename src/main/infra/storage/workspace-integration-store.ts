import { readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import { workspaceDataDir } from "@main/infra/storage/workspace-paths";
import {
  integrationCategoryIds,
  type IntegrationStageId,
  type WorkspaceIntegrationConfig,
} from "@shared/types/integration";

export function workspaceIntegrationPath(workspaceId: string): string {
  return join(workspaceDataDir(workspaceId), "integrations", "config.json");
}

export function createEmptyWorkspaceIntegrationConfig(): WorkspaceIntegrationConfig {
  return Object.fromEntries(
    integrationCategoryIds.map((stage) => [stage, [] as WorkspaceIntegrationConfig[typeof stage]])
  ) as unknown as WorkspaceIntegrationConfig;
}

function normalizeConfig(
  raw: Partial<WorkspaceIntegrationConfig> | null | undefined
): WorkspaceIntegrationConfig {
  const config = createEmptyWorkspaceIntegrationConfig();
  for (const stage of integrationCategoryIds) {
    config[stage] = Array.isArray(raw?.[stage]) ? raw[stage] : [];
  }
  return config;
}

export function loadWorkspaceIntegrationConfig(workspaceId: string): WorkspaceIntegrationConfig {
  try {
    const raw = JSON.parse(
      readFileSync(workspaceIntegrationPath(workspaceId), "utf8")
    ) as Partial<WorkspaceIntegrationConfig>;
    return normalizeConfig(raw);
  } catch {
    return createEmptyWorkspaceIntegrationConfig();
  }
}

export function saveWorkspaceIntegrationConfig(
  workspaceId: string,
  config: WorkspaceIntegrationConfig
): WorkspaceIntegrationConfig {
  const normalized = normalizeConfig(config);
  for (const stage of integrationCategoryIds) {
    normalized[stage] = normalized[stage].map((entry) => {
      const persisted = { ...entry };
      delete persisted.currentFolderId;
      delete persisted.staleFolderId;
      return persisted;
    });
  }
  writeFileAtomicSync(workspaceIntegrationPath(workspaceId), JSON.stringify(normalized, null, 2));
  return normalized;
}

export function setStageResources(
  workspaceId: string,
  stage: IntegrationStageId,
  resources: WorkspaceIntegrationConfig[IntegrationStageId]
): WorkspaceIntegrationConfig {
  const config = loadWorkspaceIntegrationConfig(workspaceId);
  config[stage] = resources;
  return saveWorkspaceIntegrationConfig(workspaceId, config);
}
