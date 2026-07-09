import { ipcMain } from "electron";
import { PlatformProvidersChannels } from "@shared/ipc/platform/providers.channels";
import {
  connectInputSchema,
  listProviderResourcesInputSchema,
  providerConnectInputSchema,
  providerIdInputSchema,
  toolIdInputSchema,
} from "@shared/ipc/platform/providers.schemas";
import type { ProviderId } from "@shared/types/integration";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import {
  connectProvider,
  disconnectProvider,
  listProviderResources,
  listProviders,
  probeProvider,
} from "@main/services/platform/providers/provider-service";
import { disconnectYunxiao } from "@main/services/platform/providers/yunxiao-service";
import {
  getConnection as getProviderConnection,
  listConnections as listProviderConnections,
  removeConnection as removeProviderConnection,
} from "@main/infra/storage/provider-connection-store";

export function registerProviderHandlers(): void {
  ipcMain.handle(PlatformProvidersChannels.getConnections, () =>
    wrapHandler(() => listProviderConnections())
  );

  ipcMain.handle(PlatformProvidersChannels.connect, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { toolId, credentials } = validate(connectInputSchema, input);
      if (toolId.startsWith("yunxiao-")) {
        await connectProvider("yunxiao", credentials);
        return getProviderConnection("yunxiao");
      }
      return null;
    })
  );

  ipcMain.handle(PlatformProvidersChannels.disconnect, (_event, input: unknown) =>
    wrapHandler(() => {
      const { toolId } = validate(toolIdInputSchema, input);
      if (toolId.startsWith("yunxiao-")) {
        disconnectYunxiao();
      } else {
        removeProviderConnection(toolId as ProviderId);
      }
    })
  );

  ipcMain.handle(PlatformProvidersChannels.list, () => wrapHandler(() => listProviders()));

  ipcMain.handle(PlatformProvidersChannels.connectProvider, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId, credentials } = validate(providerConnectInputSchema, input);
      return connectProvider(providerId as ProviderId, credentials);
    })
  );

  ipcMain.handle(PlatformProvidersChannels.disconnectProvider, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId } = validate(providerIdInputSchema, input);
      disconnectProvider(providerId as ProviderId);
    })
  );

  ipcMain.handle(PlatformProvidersChannels.probe, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId } = validate(providerIdInputSchema, input);
      return probeProvider(providerId as ProviderId);
    })
  );

  ipcMain.handle(PlatformProvidersChannels.listResources, (_event, input: unknown) =>
    wrapHandler(() => {
      const { providerId, resourceType, query } = validate(listProviderResourcesInputSchema, input);
      return listProviderResources({
        providerId: providerId as ProviderId,
        resourceType: resourceType as Parameters<typeof listProviderResources>[0]["resourceType"],
        query,
      });
    })
  );
}
