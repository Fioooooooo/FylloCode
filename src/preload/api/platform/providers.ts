import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { PlatformProvidersChannels } from "@shared/ipc/platform/providers.channels";
import type {
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
  ToolConnection,
} from "@shared/types/integration";

export const providersApi = {
  getConnections(): Promise<IpcResponse<ToolConnection[]>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.getConnections);
  },

  connect(
    toolId: string,
    credentials: Record<string, string>
  ): Promise<IpcResponse<ToolConnection>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.connect, { toolId, credentials });
  },

  disconnect(toolId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.disconnect, { toolId });
  },

  listProviders(): Promise<
    IpcResponse<Array<Provider & { connection: ProviderConnection | null }>>
  > {
    return ipcRenderer.invoke(PlatformProvidersChannels.list);
  },

  connectProvider(
    providerId: ProviderId,
    credentials: ProviderCredentials
  ): Promise<IpcResponse<ProviderConnection>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.connectProvider, {
      providerId,
      credentials,
    });
  },

  disconnectProvider(providerId: ProviderId): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.disconnectProvider, { providerId });
  },

  probeProvider(providerId: ProviderId): Promise<IpcResponse<ProviderConnection | null>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.probe, { providerId });
  },

  listProviderResources(
    providerId: ProviderId,
    resourceType: ProviderResourceType,
    query?: ProviderResourceListQuery
  ): Promise<IpcResponse<ProviderResource[]>> {
    return ipcRenderer.invoke(PlatformProvidersChannels.listResources, {
      providerId,
      resourceType,
      query,
    });
  },
};
