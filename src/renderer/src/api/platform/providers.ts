import type { IpcResponse } from "@shared/types/ipc";
import type {
  ToolConnection,
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
} from "@shared/types/integration";

export const providersApi = {
  getConnections(): Promise<IpcResponse<ToolConnection[]>> {
    return window.api.platform.providers.getConnections();
  },

  connect(
    toolId: string,
    credentials: Record<string, string>
  ): Promise<IpcResponse<ToolConnection>> {
    return window.api.platform.providers.connect(toolId, credentials);
  },

  disconnect(toolId: string): Promise<IpcResponse<void>> {
    return window.api.platform.providers.disconnect(toolId);
  },

  listProviders(): Promise<
    IpcResponse<Array<Provider & { connection: ProviderConnection | null }>>
  > {
    return window.api.platform.providers.listProviders();
  },

  connectProvider(
    providerId: ProviderId,
    credentials: ProviderCredentials
  ): Promise<IpcResponse<ProviderConnection>> {
    return window.api.platform.providers.connectProvider(providerId, credentials);
  },

  disconnectProvider(providerId: ProviderId): Promise<IpcResponse<void>> {
    return window.api.platform.providers.disconnectProvider(providerId);
  },

  probeProvider(providerId: ProviderId): Promise<IpcResponse<ProviderConnection | null>> {
    return window.api.platform.providers.probeProvider(providerId);
  },

  listProviderResources(
    providerId: ProviderId,
    resourceType: ProviderResourceType,
    query?: ProviderResourceListQuery
  ): Promise<IpcResponse<ProviderResource[]>> {
    return window.api.platform.providers.listProviderResources(providerId, resourceType, query);
  },
};
