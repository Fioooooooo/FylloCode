import type { IpcResponse } from "@shared/types/ipc";
import type {
  IntegrationTool,
  ProjectIntegrationConfig,
  ProjectIntegrationEntry,
  ToolConnection,
  ProjectToolConfig,
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
  YunxiaoOrganization,
} from "@shared/types/integration";

export const integrationApi = {
  listTools(): Promise<IpcResponse<IntegrationTool[]>> {
    return window.api.integration.listTools();
  },

  getConnections(): Promise<IpcResponse<ToolConnection[]>> {
    return window.api.integration.getConnections();
  },

  getConnection(toolId: string): Promise<IpcResponse<ToolConnection | null>> {
    return window.api.integration.getConnection(toolId);
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

  listProjectConfigs(projectId: string): Promise<IpcResponse<ProjectToolConfig[]>> {
    return window.api.integration.listProjectConfigs(projectId);
  },

  setProjectConfig(
    projectId: string,
    toolId: string,
    enabled: boolean,
    overrides: Record<string, unknown>
  ): Promise<IpcResponse<ProjectToolConfig>> {
    return window.api.integration.setProjectConfig(projectId, toolId, enabled, overrides);
  },
  yunxiaoSetToken(token: string): Promise<IpcResponse<YunxiaoOrganization[]>> {
    return window.api.integration.yunxiaoSetToken(token);
  },

  yunxiaoSetOrganization(organizationId: string): Promise<IpcResponse<void>> {
    return window.api.integration.yunxiaoSetOrganization(organizationId);
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
