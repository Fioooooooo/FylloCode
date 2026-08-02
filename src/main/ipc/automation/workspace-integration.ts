import { ipcMain } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { providerMap } from "@shared/constants/integration-providers";
import { AutomationWorkspaceIntegrationChannels } from "@shared/ipc/automation/workspace-integration.channels";
import {
  getWorkspaceIntegrationInputSchema,
  setWorkspaceIntegrationInputSchema,
} from "@shared/ipc/automation/workspace-integration.schemas";
import { ipcError } from "@shared/errors/ipc-error";
import type { WorkspaceIntegrationEntry, ProviderId } from "@shared/types/integration";
import {
  getWorkspaceIntegration,
  setWorkspaceIntegrationStage,
} from "@main/services/automation/workspace-integration/workspace-integration-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerWorkspaceIntegrationHandlers(): void {
  ipcMain.handle(AutomationWorkspaceIntegrationChannels.get, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(getWorkspaceIntegrationInputSchema, input);
      return getWorkspaceIntegration(workspaceId);
    })
  );

  ipcMain.handle(AutomationWorkspaceIntegrationChannels.set, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, stage, resources } = validate(setWorkspaceIntegrationInputSchema, input);
      for (const resource of resources) {
        const provider = providerMap.get(resource.providerId as ProviderId);
        const isValid = provider?.capabilities.some(
          (capability) =>
            capability.stage === stage && capability.resourceType === resource.resourceType
        );
        if (!isValid) {
          throw ipcError(
            IpcErrorCodes.INTEGRATION_RESOURCE_TYPE_NOT_SUPPORTED,
            `Invalid integration resource tuple: ${resource.providerId}/${resource.resourceType}/${stage}`
          );
        }
      }
      return setWorkspaceIntegrationStage(
        workspaceId,
        stage as Parameters<typeof setWorkspaceIntegrationStage>[1],
        resources as WorkspaceIntegrationEntry[]
      );
    })
  );
}
