import {
  isRepositoryBoundIntegrationStage,
  type IntegrationStageId,
  type WorkspaceIntegrationConfig,
  type WorkspaceIntegrationEntry,
} from "@shared/types/integration";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@main/ipc/_kit/errors";
import { resolveWorkspace } from "@main/services/workspace/_public";
import {
  loadWorkspaceIntegrationConfig,
  setStageResources,
} from "@main/infra/storage/workspace-integration-store";

function projectEntry(
  entry: WorkspaceIntegrationEntry,
  memberFolderIds: ReadonlySet<string>
): WorkspaceIntegrationEntry {
  const persisted = { ...entry };
  delete persisted.currentFolderId;
  delete persisted.staleFolderId;
  if (!persisted.folderId) {
    return persisted;
  }
  return memberFolderIds.has(persisted.folderId)
    ? { ...persisted, currentFolderId: persisted.folderId }
    : { ...persisted, staleFolderId: persisted.folderId };
}

export async function getWorkspaceIntegration(
  workspaceId: string
): Promise<WorkspaceIntegrationConfig> {
  const workspace = await resolveWorkspace(workspaceId);
  const memberFolderIds = new Set(workspace.folders.map((folder) => folder.folderId));
  const config = loadWorkspaceIntegrationConfig(workspaceId);
  return Object.fromEntries(
    Object.entries(config).map(([stage, entries]) => [
      stage,
      entries.map((entry) => projectEntry(entry, memberFolderIds)),
    ])
  ) as WorkspaceIntegrationConfig;
}

export async function setWorkspaceIntegrationStage(
  workspaceId: string,
  stage: IntegrationStageId,
  resources: WorkspaceIntegrationConfig[keyof WorkspaceIntegrationConfig]
): Promise<WorkspaceIntegrationConfig> {
  const workspace = await resolveWorkspace(workspaceId);
  const memberFolderIds = new Set(workspace.folders.map((folder) => folder.folderId));
  const repositoryBound = isRepositoryBoundIntegrationStage(stage);
  for (const resource of resources) {
    if (repositoryBound && (!resource.folderId || !memberFolderIds.has(resource.folderId))) {
      throw ipcError(
        IpcErrorCodes.VALIDATION_ERROR,
        `Repository-bound integration requires a current Workspace Folder: ${resource.resourceId}`
      );
    }
    if (!repositoryBound && resource.folderId) {
      throw ipcError(
        IpcErrorCodes.VALIDATION_ERROR,
        `Workspace-level integration must not bind a Folder: ${resource.resourceId}`
      );
    }
  }
  setStageResources(workspaceId, stage, resources);
  return getWorkspaceIntegration(workspaceId);
}
