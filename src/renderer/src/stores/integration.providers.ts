import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { integrationApi } from "@renderer/api/integration";
import {
  integrationCategories,
  providers as providerManifest,
} from "@shared/constants/integration-providers";
import type {
  IntegrationCategory,
  ProjectIntegrationConfig,
  ProjectIntegrationEntry,
  Provider,
  ProviderConnection,
  ProviderCredentials,
  ProviderId,
  ProviderResource,
  ProviderResourceListQuery,
  ProviderResourceType,
} from "@shared/types/integration";

export const useIntegrationProvidersStore = defineStore("integration-providers", () => {
  const providers = ref<Array<Provider & { connection: ProviderConnection | null }>>([]);
  const projectIntegration = ref<ProjectIntegrationConfig | null>(null);
  const loadingProviderIds = ref<string[]>([]);
  const resourceLoadingKeys = ref<string[]>([]);
  const resourceOptions = ref<Record<string, ProviderResource[]>>({});
  const searchQuery = ref("");

  const categories = computed<IntegrationCategory[]>(() => integrationCategories);

  const providersById = computed(() => {
    return new Map(providers.value.map((provider) => [provider.id, provider]));
  });

  const filteredProviders = computed(() => {
    const keyword = searchQuery.value.trim().toLowerCase();
    if (!keyword) return providers.value;
    return providers.value.filter((provider) => {
      const capabilityText = provider.capabilities.map((capability) => capability.label).join(" ");
      return (
        provider.name.toLowerCase().includes(keyword) ||
        provider.description.toLowerCase().includes(keyword) ||
        capabilityText.toLowerCase().includes(keyword)
      );
    });
  });

  function setSearchQuery(query: string): void {
    searchQuery.value = query;
  }

  function markLoading(
    bucket: typeof loadingProviderIds.value,
    key: string,
    loading: boolean
  ): void {
    if (loading) {
      if (!bucket.includes(key)) bucket.push(key);
      return;
    }
    const index = bucket.indexOf(key);
    if (index >= 0) bucket.splice(index, 1);
  }

  function resourceKey(providerId: ProviderId, resourceType: ProviderResourceType): string {
    return `${providerId}:${resourceType}`;
  }

  async function loadProviders(): Promise<void> {
    const result = await integrationApi.listProviders();
    if (result.ok) {
      providers.value = result.data;
      return;
    }
    providers.value = providerManifest.map((provider) => ({ ...provider, connection: null }));
  }

  async function connectProvider(
    providerId: ProviderId,
    credentials: ProviderCredentials
  ): Promise<{ ok: boolean; error?: string }> {
    markLoading(loadingProviderIds.value, providerId, true);
    const result = await integrationApi.connectProvider(providerId, credentials);
    markLoading(loadingProviderIds.value, providerId, false);
    if (!result.ok) {
      return { ok: false, error: result.error.message };
    }
    await loadProviders();
    return { ok: true };
  }

  async function disconnectProvider(providerId: ProviderId): Promise<void> {
    markLoading(loadingProviderIds.value, providerId, true);
    await integrationApi.disconnectProvider(providerId);
    markLoading(loadingProviderIds.value, providerId, false);
    await loadProviders();
  }

  async function probeProvider(providerId: ProviderId): Promise<void> {
    markLoading(loadingProviderIds.value, providerId, true);
    await integrationApi.probeProvider(providerId);
    markLoading(loadingProviderIds.value, providerId, false);
    await loadProviders();
  }

  async function probeConnectedProviders(): Promise<void> {
    await Promise.all(
      providers.value
        .filter((provider) => provider.connection?.state === "connected")
        .map((provider) => probeProvider(provider.id))
    );
  }

  async function loadProjectIntegration(projectId: string): Promise<void> {
    if (!projectId) {
      projectIntegration.value = null;
      return;
    }
    const result = await integrationApi.getProjectIntegration(projectId);
    if (result.ok) {
      projectIntegration.value = result.data;
    }
  }

  async function saveProjectIntegrationStage(
    projectId: string,
    stage: keyof ProjectIntegrationConfig,
    resources: ProjectIntegrationEntry[]
  ): Promise<void> {
    const result = await integrationApi.setProjectIntegration(projectId, stage, resources);
    if (result.ok) {
      projectIntegration.value = result.data;
    }
  }

  async function loadProviderResources(
    providerId: ProviderId,
    resourceType: ProviderResourceType,
    query?: ProviderResourceListQuery
  ): Promise<ProviderResource[]> {
    const key = resourceKey(providerId, resourceType);
    markLoading(resourceLoadingKeys.value, key, true);
    const result = await integrationApi.listProviderResources(providerId, resourceType, query);
    markLoading(resourceLoadingKeys.value, key, false);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    resourceOptions.value[key] = result.data;
    return result.data;
  }

  function getStageEntries(stage: keyof ProjectIntegrationConfig): ProjectIntegrationEntry[] {
    return projectIntegration.value?.[stage] ?? [];
  }

  function getMountedEntries(
    providerId: ProviderId,
    stage: keyof ProjectIntegrationConfig
  ): ProjectIntegrationEntry[] {
    return getStageEntries(stage).filter((entry) => entry.providerId === providerId);
  }

  function getProviderStatus(
    providerId: ProviderId
  ): ProviderConnection["state"] | "not-connected" {
    return providersById.value.get(providerId)?.connection?.state ?? "not-connected";
  }

  function isProviderBusy(providerId: ProviderId): boolean {
    return loadingProviderIds.value.includes(providerId);
  }

  function isResourceLoading(providerId: ProviderId, resourceType: ProviderResourceType): boolean {
    return resourceLoadingKeys.value.includes(resourceKey(providerId, resourceType));
  }

  return {
    providers,
    categories,
    projectIntegration,
    searchQuery,
    filteredProviders,
    providersById,
    resourceOptions,
    loadProviders,
    connectProvider,
    disconnectProvider,
    probeProvider,
    probeConnectedProviders,
    loadProjectIntegration,
    saveProjectIntegrationStage,
    loadProviderResources,
    setSearchQuery,
    getStageEntries,
    getMountedEntries,
    getProviderStatus,
    isProviderBusy,
    isResourceLoading,
  };
});
