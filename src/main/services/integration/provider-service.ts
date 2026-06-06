import { providers, providerMap } from "@shared/constants/integration-providers";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import type {
  ProjectIntegrationConfig,
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
} from "@shared/types/integration";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "@main/infra/storage/provider-credential-store";
import {
  getConnection,
  listConnections,
  removeConnection,
  saveConnection,
} from "@main/infra/storage/provider-connection-store";
import {
  getUser as getYunxiaoUser,
  listOrganizations,
} from "@main/domain/integration/yunxiao/organization";
import { YunxiaoApiError } from "@main/domain/integration/yunxiao/client";
import {
  loadProjectIntegrationConfig,
  setStageResources,
} from "@main/infra/storage/project-integration-store";
import { listProviderResources as listProviderResourcesFromRegistry } from "@main/services/integration/provider-resource-service";

function assertProvider(providerId: ProviderId): Provider {
  const provider = providerMap.get(providerId);
  if (!provider) {
    throw ipcError(
      IpcErrorCodes.INTEGRATION_PROVIDER_NOT_SUPPORTED,
      `Unsupported integration provider: ${providerId}`
    );
  }
  return provider;
}

function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function toPreview(credentials: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials)
      .filter(([, value]) => value.trim().length > 0)
      .map(([key, value]) => [key, maskValue(value)])
  );
}

function isAuthExpired(error: unknown): boolean {
  return error instanceof YunxiaoApiError && (error.status === 401 || error.status === 403);
}

export async function listProviders(): Promise<
  Array<Provider & { connection: ProviderConnection | null }>
> {
  const connections = new Map(
    listConnections().map((connection) => [connection.providerId, connection])
  );
  return providers.map((provider) => ({
    ...provider,
    connection: connections.get(provider.id) ?? null,
  }));
}

export async function connectProvider(
  providerId: ProviderId,
  credentials: ProviderCredentials
): Promise<ProviderConnection> {
  const provider = assertProvider(providerId);

  if (provider.id !== "yunxiao") {
    throw ipcError(
      IpcErrorCodes.INTEGRATION_PROVIDER_NOT_SUPPORTED,
      `Provider is not implemented yet: ${provider.id}`
    );
  }

  const currentCredentials = loadCredentials(providerId);
  saveCredentials(providerId, credentials);

  try {
    const [user, organizations] = await Promise.all([getYunxiaoUser(), listOrganizations()]);
    const connection = saveConnection({
      providerId,
      state: "connected",
      accountId: user.id,
      accountName: user.email || user.username || user.name,
      connectedAt: new Date().toISOString(),
      credentialPreview: toPreview(credentials),
    });

    const organizationId =
      currentCredentials["organizationId"] || user.lastOrganization || organizations[0]?.id;
    const nextCredentials: ProviderCredentials = {
      ...currentCredentials,
      ...credentials,
      userId: user.id,
    };
    if (organizationId) {
      nextCredentials.organizationId = organizationId;
    } else {
      delete nextCredentials.organizationId;
    }
    saveCredentials(providerId, nextCredentials);

    return connection;
  } catch (error) {
    clearCredentials(providerId);
    throw error;
  }
}

export function disconnectProvider(providerId: ProviderId): void {
  assertProvider(providerId);
  clearCredentials(providerId);
  removeConnection(providerId);
}

export async function probeProvider(providerId: ProviderId): Promise<ProviderConnection | null> {
  const provider = assertProvider(providerId);
  const connection = getConnection(providerId);
  if (!connection) {
    return null;
  }

  if (provider.id !== "yunxiao") {
    return connection;
  }

  try {
    const user = await getYunxiaoUser();
    return saveConnection({
      ...connection,
      state: "connected",
      accountId: user.id,
      accountName: user.email || user.username || user.name,
      credentialPreview: connection.credentialPreview ?? toPreview(loadCredentials(providerId)),
    });
  } catch (error) {
    if (!isAuthExpired(error)) {
      throw error;
    }
    return saveConnection({
      ...connection,
      state: "expired",
      credentialPreview: connection.credentialPreview ?? toPreview(loadCredentials(providerId)),
    });
  }
}

export async function listProviderResources(input: {
  providerId: ProviderId;
  resourceType: ProviderResourceType;
  query?: ProviderResourceListQuery;
}): Promise<ProviderResource[]> {
  assertProvider(input.providerId);
  return listProviderResourcesFromRegistry({
    ...input,
    connection: getConnection(input.providerId),
  });
}

export function getProjectIntegration(projectId: string): ProjectIntegrationConfig {
  return loadProjectIntegrationConfig(projectId);
}

export function setProjectIntegrationStage(
  projectId: string,
  stage: keyof ProjectIntegrationConfig,
  resources: ProjectIntegrationConfig[keyof ProjectIntegrationConfig]
): ProjectIntegrationConfig {
  return setStageResources(projectId, stage, resources);
}
