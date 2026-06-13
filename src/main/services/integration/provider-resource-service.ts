import { loadCredentials } from "@main/infra/storage/provider-credential-store";
import { saveConnection } from "@main/infra/storage/provider-connection-store";
import { ipcError } from "@shared/errors/ipc-error";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  ProviderConnection,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
} from "@shared/types/integration";
import { YunxiaoApiError } from "@main/infra/integration/yunxiao/client";
import { listPipelines } from "@main/infra/integration/yunxiao/flow";
import { listRepositories } from "@main/infra/integration/yunxiao/codeup";
import { searchProjects } from "@main/infra/integration/yunxiao/projex";

type ResourceLoader = (query?: ProviderResourceListQuery) => Promise<ProviderResource[]>;

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 50;

const cache = new Map<string, { expiresAt: number; resources: ProviderResource[] }>();

function getOrganizationId(providerId: ProviderId): string {
  const organizationId = loadCredentials(providerId)["organizationId"];
  if (!organizationId) {
    throw ipcError(
      IpcErrorCodes.INTEGRATION_PROVIDER_NOT_CONNECTED,
      `Missing organizationId for provider: ${providerId}`
    );
  }
  return organizationId;
}

function cacheKey(
  providerId: ProviderId,
  resourceType: ProviderResourceType,
  query?: ProviderResourceListQuery
): string {
  return `${providerId}:${resourceType}:${JSON.stringify(query ?? {})}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
  while (cache.size > CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) break;
    cache.delete(firstKey);
  }
}

function readCache(
  providerId: ProviderId,
  resourceType: ProviderResourceType,
  query?: ProviderResourceListQuery
): ProviderResource[] | null {
  const key = cacheKey(providerId, resourceType, query);
  pruneCache();
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.resources;
}

function writeCache(
  providerId: ProviderId,
  resourceType: ProviderResourceType,
  query: ProviderResourceListQuery | undefined,
  resources: ProviderResource[]
): ProviderResource[] {
  pruneCache();
  cache.set(cacheKey(providerId, resourceType, query), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    resources,
  });
  return resources;
}

function markExpired(connection: ProviderConnection): ProviderConnection {
  return saveConnection({ ...connection, state: "expired" });
}

const registry: Partial<Record<ProviderId, Partial<Record<ProviderResourceType, ResourceLoader>>>> =
  {
    yunxiao: {
      "projex-project": async (query) => {
        const organizationId = getOrganizationId("yunxiao");
        const projects = await searchProjects({
          organizationId,
          search: query?.search,
          page: query?.page,
          perPage: query?.perPage,
        });
        return projects.map((project) => ({
          id: project.id,
          name: project.name,
          providerId: "yunxiao",
          resourceType: "projex-project",
          subtitle: project.customCode || project.description || project.logicalStatus,
        }));
      },
      "codeup-repo": async (query) => {
        const organizationId = getOrganizationId("yunxiao");
        const repositories = await listRepositories({
          organizationId,
          search: query?.search,
          page: query?.page,
          perPage: query?.perPage,
        });
        return repositories.map((repository) => ({
          id: String(repository.Id),
          name: repository.name,
          providerId: "yunxiao",
          resourceType: "codeup-repo",
          subtitle: repository.pathWithNamespace || repository.description || repository.path,
        }));
      },
      "flow-pipeline": async (query) => {
        const pipelines = await listPipelines({
          pipelineName: query?.search,
          page: query?.page,
          perPage: query?.perPage,
        });
        return pipelines.map((pipeline) => ({
          id: String(pipeline.pipelineId),
          name: pipeline.pipelineName,
          providerId: "yunxiao",
          resourceType: "flow-pipeline",
          subtitle: pipeline.createAccountId,
        }));
      },
    },
  };

export async function listProviderResources(input: {
  providerId: ProviderId;
  resourceType: ProviderResourceType;
  query?: ProviderResourceListQuery;
  connection: ProviderConnection | null;
}): Promise<ProviderResource[]> {
  if (!input.connection) {
    throw ipcError(
      IpcErrorCodes.INTEGRATION_PROVIDER_NOT_CONNECTED,
      `Provider is not connected: ${input.providerId}`
    );
  }

  if (!input.query?.refresh) {
    const cached = readCache(input.providerId, input.resourceType, input.query);
    if (cached) return cached;
  }

  const loader = registry[input.providerId]?.[input.resourceType];
  if (!loader) {
    throw ipcError(
      IpcErrorCodes.INTEGRATION_RESOURCE_TYPE_NOT_SUPPORTED,
      `Unsupported provider resource type: ${input.providerId}/${input.resourceType}`
    );
  }

  try {
    const resources = await loader(input.query);
    return writeCache(input.providerId, input.resourceType, input.query, resources);
  } catch (error) {
    if (error instanceof YunxiaoApiError && (error.status === 401 || error.status === 403)) {
      markExpired(input.connection);
    }
    throw error;
  }
}
