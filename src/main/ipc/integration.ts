import { ipcMain } from "electron";
import { IntegrationChannels } from "@shared/types/channels";
import {
  connectInputSchema,
  getProjectIntegrationInputSchema,
  listProviderResourcesInputSchema,
  providerConnectInputSchema,
  providerIdInputSchema,
  setProjectIntegrationInputSchema,
  toolIdInputSchema,
} from "@shared/schemas/ipc/integration";
import { providerMap } from "@shared/constants/integration-providers";
import type { ProjectIntegrationEntry, ProviderId } from "@shared/types/integration";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  connectProvider,
  disconnectProvider,
  getProjectIntegration,
  listProviderResources,
  listProviders,
  probeProvider,
  setProjectIntegrationStage,
} from "@main/services/integration/provider-service";
import { disconnectYunxiao } from "@main/services/integration/yunxiao-service";
import {
  getConnection as getProviderConnection,
  listConnections as listProviderConnections,
  removeConnection as removeProviderConnection,
} from "@main/infra/storage/provider-connection-store";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";

export function registerIntegrationHandlers(): void {
  ipcMain.handle(IntegrationChannels.getConnections, () =>
    wrapHandler(() => listProviderConnections())
  );

  ipcMain.handle(IntegrationChannels.connect, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { toolId, credentials } = validate(connectInputSchema, input);
      if (toolId.startsWith("yunxiao-")) {
        await connectProvider("yunxiao", credentials);
        return getProviderConnection("yunxiao");
      }
      return null;
    })
  );

  ipcMain.handle(IntegrationChannels.disconnect, (_event, input: unknown) =>
    wrapHandler(() => {
      const { toolId } = validate(toolIdInputSchema, input);
      if (toolId.startsWith("yunxiao-")) {
        disconnectYunxiao();
      } else {
        removeProviderConnection(toolId as ProviderId);
      }
    })
  );

  ipcMain.handle(IntegrationChannels.providersList, () => wrapHandler(() => listProviders()));

  ipcMain.handle(IntegrationChannels.providersConnect, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId, credentials } = validate(providerConnectInputSchema, input);
      return connectProvider(providerId as ProviderId, credentials);
    })
  );

  ipcMain.handle(IntegrationChannels.providersDisconnect, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId } = validate(providerIdInputSchema, input);
      disconnectProvider(providerId as ProviderId);
    })
  );

  ipcMain.handle(IntegrationChannels.providersProbe, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId } = validate(providerIdInputSchema, input);
      return probeProvider(providerId as ProviderId);
    })
  );

  ipcMain.handle(IntegrationChannels.providersListResources, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId, resourceType, query } = validate(listProviderResourcesInputSchema, input);
      return listProviderResources({
        providerId: providerId as ProviderId,
        resourceType: resourceType as Parameters<typeof listProviderResources>[0]["resourceType"],
        query,
      });
    })
  );

  ipcMain.handle(IntegrationChannels.projectGet, (_event, input: unknown) =>
    wrapHandler(() => {
      const { projectId } = validate(getProjectIntegrationInputSchema, input);
      return getProjectIntegration(projectId);
    })
  );

  ipcMain.handle(IntegrationChannels.projectSet, (_event, input: unknown) =>
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
