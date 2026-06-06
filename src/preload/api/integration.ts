import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { IntegrationChannels } from "@shared/types/channels";
import type {
  ProjectIntegrationConfig,
  ProjectIntegrationEntry,
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
  ToolConnection,
} from "@shared/types/integration";

export const integrationApi = {
  getConnections(): Promise<IpcResponse<ToolConnection[]>> {
    return ipcRenderer.invoke(IntegrationChannels.getConnections);
  },

  connect(
    toolId: string,
    credentials: Record<string, string>
  ): Promise<IpcResponse<ToolConnection>> {
    return ipcRenderer.invoke(IntegrationChannels.connect, { toolId, credentials });
  },

  disconnect(toolId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(IntegrationChannels.disconnect, { toolId });
  },

  listProviders(): Promise<
    IpcResponse<Array<Provider & { connection: ProviderConnection | null }>>
  > {
    return ipcRenderer.invoke(IntegrationChannels.providersList);
  },

  connectProvider(
    providerId: ProviderId,
    credentials: ProviderCredentials
  ): Promise<IpcResponse<ProviderConnection>> {
    return ipcRenderer.invoke(IntegrationChannels.providersConnect, { providerId, credentials });
  },

  disconnectProvider(providerId: ProviderId): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(IntegrationChannels.providersDisconnect, { providerId });
  },

  probeProvider(providerId: ProviderId): Promise<IpcResponse<ProviderConnection | null>> {
    return ipcRenderer.invoke(IntegrationChannels.providersProbe, { providerId });
  },

  listProviderResources(
    providerId: ProviderId,
    resourceType: ProviderResourceType,
    query?: ProviderResourceListQuery
  ): Promise<IpcResponse<ProviderResource[]>> {
    return ipcRenderer.invoke(IntegrationChannels.providersListResources, {
      providerId,
      resourceType,
      query,
    });
  },

  getProjectIntegration(projectId: string): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return ipcRenderer.invoke(IntegrationChannels.projectGet, { projectId });
  },

  setProjectIntegration(
    projectId: string,
    stage: keyof ProjectIntegrationConfig,
    resources: ProjectIntegrationEntry[]
  ): Promise<IpcResponse<ProjectIntegrationConfig>> {
    return ipcRenderer.invoke(IntegrationChannels.projectSet, {
      projectId,
      stage,
      resources,
    });
  },
};
