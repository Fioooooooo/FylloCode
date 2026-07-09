import { ipcMain } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { providerMap } from "@shared/constants/integration-providers";
import { AutomationProjectIntegrationChannels } from "@shared/ipc/automation/project-integration.channels";
import {
  getProjectIntegrationInputSchema,
  setProjectIntegrationInputSchema,
} from "@shared/ipc/automation/project-integration.schemas";
import { ipcError } from "@shared/errors/ipc-error";
import type { ProjectIntegrationEntry, ProviderId } from "@shared/types/integration";
import {
  getProjectIntegration,
  setProjectIntegrationStage,
} from "@main/services/automation/project-integration/project-integration-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerProjectIntegrationHandlers(): void {
  ipcMain.handle(AutomationProjectIntegrationChannels.get, (_event, input: unknown) =>
    wrapHandler(() => {
      const { projectId } = validate(getProjectIntegrationInputSchema, input);
      return getProjectIntegration(projectId);
    })
  );

  ipcMain.handle(AutomationProjectIntegrationChannels.set, (_event, input: unknown) =>
    wrapHandler(() => {
      const { projectId, stage, resources } = validate(setProjectIntegrationInputSchema, input);
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
      return setProjectIntegrationStage(
        projectId,
        stage as Parameters<typeof setProjectIntegrationStage>[1],
        resources as ProjectIntegrationEntry[]
      );
    })
  );
}
