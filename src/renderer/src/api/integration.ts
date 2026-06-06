import type { IpcResponse } from "@shared/types/ipc";
import type {
  ProjectIntegrationConfig,
  ProjectIntegrationEntry,
  ToolConnection,
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
} from "@shared/types/integration";

export const integrationApi = {
  getConnections(): Promise<IpcResponse<ToolConnection[]>> {
    return window.api.integration.getConnections();
  },

  connect(
    toolId: string,
    credentials: Record<string, string>
  ): Promise<IpcResponse<ToolConnection>> {
    return window.api.integration.connect(toolId, credentials);
  },

  disconnect(toolId: string): Promise<IpcResponse<void>> {
    return window.api.integration.disconnect(toolId);
  },

  listProviders(): Promise<
    IpcResponse<Array<Provider & { connection: ProviderConnection | null }>>
  > {
    return window.api.integration.listProviders();
  },

  connectProvider(
    providerId: ProviderId,
    credentials: ProviderCredentials
  ): Promise<IpcResponse<ProviderConnection>> {
    return window.api.integration.connectProvider(providerId, credentials);
  },

  disconnectProvider(providerId: ProviderId): Promise<IpcResponse<void>> {
    return window.api.integration.disconnectProvider(providerId);
  },

  probeProvider(providerId: ProviderId): Promise<IpcResponse<ProviderConnection | null>> {
    return window.api.integration.probeProvider(providerId);
  },

  listProviderResources(
    providerId: ProviderId,
    resourceType: ProviderResourceType,
    query?: ProviderResourceListQuery
  ): Promise<IpcResponse<ProviderResource[]>> {
    return window.api.integration.listProviderResources(providerId, resourceType, query);
  },

  getProjectIntegration(projectId: string): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return window.api.integration.getProjectIntegration(projectId);
  },

  setProjectIntegration(
    projectId: string,
    stage: keyof ProjectIntegrationConfig,
    resources: ProjectIntegrationEntry[]
  ): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return window.api.integration.setProjectIntegration(projectId, stage, resources);
  },
};
