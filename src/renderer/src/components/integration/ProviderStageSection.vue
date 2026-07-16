<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useIntegrationProvidersStore } from "@renderer/stores";
import type {
  IntegrationCategory,
  ProjectIntegrationConfig,
  Provider,
  ProviderCapability,
  ProviderResource,
  ProviderResourceType,
} from "@shared/types/integration";

const props = defineProps<{
  category: IntegrationCategory;
  providers: Provider[];
  currentProjectId: string;
}>();

const router = useRouter();
const integrationProvidersStore = useIntegrationProvidersStore();
const expandedId = ref<string | null>(null);
const activePickerKey = ref<string | null>(null);
const resourcePickerSearch = ref<Record<string, string>>({});
const resourcePickerSelection = ref<Record<string, string[]>>({});
const resourcePickerErrors = ref<Record<string, string>>({});

const stageProviders = computed(() => {
  return props.providers.filter((provider) => {
    const hasMountedEntries =
      integrationProvidersStore.getMountedEntries(
        provider.id,
        props.category.id as keyof ProjectIntegrationConfig
      ).length > 0;
    const isConnected = integrationProvidersStore.getProviderStatus(provider.id) === "connected";
    return hasMountedEntries || isConnected;
  });
});

const availableProviders = computed(() =>
  props.providers.filter((provider) =>
    provider.capabilities.some((capability) => capability.stage === props.category.id)
  )
);

function capabilityLabels(provider: Provider): string {
  return provider.capabilities
    .filter((capability) => capability.stage === props.category.id)
    .map((capability) => capability.label)
    .join(" · ");
}

function stageId(): keyof ProjectIntegrationConfig {
  return props.category.id as keyof ProjectIntegrationConfig;
}

function resourceKey(providerId: Provider["id"], resourceType: ProviderResourceType): string {
  return `${providerId}:${resourceType}`;
}

function statusText(providerId: Provider["id"]): string {
  const status = integrationProvidersStore.getProviderStatus(providerId);
  if (status === "connected") return "已连接";
  if (status === "expired") return "凭证已过期";
  return "未连接";
}

function toggle(providerId: string): void {
  expandedId.value = expandedId.value === providerId ? null : providerId;
}

function openSettings(providerId: string): void {
  void router.push({
    path: "/settings/connections",
    query: {
      focus: providerId,
    },
  });
}

function getCapabilityEntries(
  providerId: Provider["id"],
  resourceType: ProviderResourceType
): ProjectIntegrationConfig[keyof ProjectIntegrationConfig] {
  return integrationProvidersStore
    .getMountedEntries(providerId, stageId())
    .filter((entry) => entry.resourceType === resourceType);
}

function getResourceOptions(
  providerId: Provider["id"],
  resourceType: ProviderResourceType
): ProviderResource[] {
  return integrationProvidersStore.resourceOptions[resourceKey(providerId, resourceType)] ?? [];
}

function isPickerOpen(providerId: Provider["id"], resourceType: ProviderResourceType): boolean {
  return activePickerKey.value === resourceKey(providerId, resourceType);
}

function toggleResourceSelection(
  providerId: Provider["id"],
  resourceType: ProviderResourceType,
  resourceId: string,
  checked: boolean
): void {
  const key = resourceKey(providerId, resourceType);
  const current = new Set(resourcePickerSelection.value[key] ?? []);
  if (checked) current.add(resourceId);
  else current.delete(resourceId);
  resourcePickerSelection.value[key] = Array.from(current);
}

async function loadResourceOptions(
  providerId: Provider["id"],
  resourceType: ProviderResourceType,
  options?: { refresh?: boolean }
): Promise<void> {
  const key = resourceKey(providerId, resourceType);
  resourcePickerErrors.value[key] = "";
  try {
    await integrationProvidersStore.loadProviderResources(providerId, resourceType, {
      search: resourcePickerSearch.value[key]?.trim() || undefined,
      perPage: 50,
      refresh: options?.refresh,
    });
  } catch (error) {
    resourcePickerErrors.value[key] =
      error instanceof Error ? error.message : "资源拉取失败，请稍后重试。";
  }
}

async function openResourcePicker(
  providerId: Provider["id"],
  capability: ProviderCapability
): Promise<void> {
  const key = resourceKey(providerId, capability.resourceType);
  activePickerKey.value = key;
  resourcePickerSearch.value[key] ??= "";
  resourcePickerSelection.value[key] = getCapabilityEntries(
    providerId,
    capability.resourceType
  ).map((entry) => entry.resourceId);
  await loadResourceOptions(providerId, capability.resourceType);
}

async function handleAddProvider(provider: Provider): Promise<void> {
  const status = integrationProvidersStore.getProviderStatus(provider.id);
  if (provider.comingSoon || status !== "connected") {
    openSettings(provider.id);
    return;
  }

  expandedId.value = provider.id;
  const firstCapability = provider.capabilities.find(
    (capability) => capability.stage === props.category.id
  );
  if (!firstCapability) return;
  await openResourcePicker(provider.id, firstCapability);
}

function closeResourcePicker(): void {
  activePickerKey.value = null;
}

async function applyResourceSelection(
  providerId: Provider["id"],
  resourceType: ProviderResourceType
): Promise<void> {
  const key = resourceKey(providerId, resourceType);
  const selectedIds = new Set(resourcePickerSelection.value[key] ?? []);
  const nextEntries = integrationProvidersStore
    .getStageEntries(stageId())
    .filter((entry) => !(entry.providerId === providerId && entry.resourceType === resourceType));

  for (const resourceId of selectedIds) {
    nextEntries.push({
      providerId,
      resourceType,
      resourceId,
    });
  }

  await integrationProvidersStore.saveProjectIntegrationStage(
    props.currentProjectId,
    stageId(),
    nextEntries
  );
  activePickerKey.value = null;
}

async function handleRemoveResource(
  providerId: Provider["id"],
  resourceType: ProviderResourceType,
  resourceId: string
): Promise<void> {
  const nextEntries = integrationProvidersStore
    .getStageEntries(stageId())
    .filter(
      (entry) =>
        !(
          entry.providerId === providerId &&
          entry.resourceType === resourceType &&
          entry.resourceId === resourceId
        )
    );
  await integrationProvidersStore.saveProjectIntegrationStage(
    props.currentProjectId,
    stageId(),
    nextEntries
  );
}
</script>

<template>
  <section class="space-y-4">
    <div class="space-y-1">
      <h2 class="text-lg font-semibold text-highlighted">{{ category.name }}</h2>
      <p class="text-sm text-muted">{{ category.description }}</p>
    </div>

    <div v-if="stageProviders.length > 0" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <article
        v-for="provider in stageProviders"
        :key="provider.id"
        class="rounded-xl border border-default bg-card"
        :data-test="`provider-card-${provider.id}`"
      >
        <div class="flex items-start justify-between gap-4 px-4 py-4">
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            :data-test="`toggle-provider-${provider.id}`"
            @click="toggle(provider.id)"
          >
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <UIcon :name="provider.logoIcon" class="h-4 w-4" :class="provider.logoColor" />
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">{{ provider.name }}</h3>
                  <p class="text-xs text-muted">{{ capabilityLabels(provider) }}</p>
                </div>
              </div>
            </div>
          </button>
          <button type="button" class="shrink-0" @click.stop="openSettings(provider.id)">
            <UBadge
              :color="
                integrationProvidersStore.getProviderStatus(provider.id) === 'connected'
                  ? 'success'
                  : integrationProvidersStore.getProviderStatus(provider.id) === 'expired'
                    ? 'warning'
                    : 'neutral'
              "
              variant="soft"
              size="xs"
            >
              {{ statusText(provider.id) }}
            </UBadge>
          </button>
        </div>

        <div v-if="expandedId === provider.id" class="border-t border-default px-4 py-4">
          <div
            v-if="integrationProvidersStore.getProviderStatus(provider.id) !== 'connected'"
            class="rounded-lg border border-dashed border-default px-4 py-3 text-sm text-muted"
          >
            该 provider 当前不可用，请前往设置页面完成连接或重新连接。
            <div class="mt-3">
              <UButton size="sm" variant="soft" color="neutral" @click="openSettings(provider.id)">
                去设置
              </UButton>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="capability in provider.capabilities.filter(
                (item) => item.stage === category.id
              )"
              :key="capability.resourceType"
              class="space-y-2"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-highlighted">{{ capability.label }}</p>
                  <p class="text-xs text-muted">{{ capability.description }}</p>
                </div>
                <UButton
                  size="xs"
                  variant="soft"
                  color="primary"
                  :data-test="`open-picker-${provider.id}-${capability.resourceType}`"
                  :loading="
                    integrationProvidersStore.isResourceLoading(
                      provider.id,
                      capability.resourceType
                    )
                  "
                  @click="openResourcePicker(provider.id, capability)"
                >
                  添加资源
                </UButton>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  v-for="entry in getCapabilityEntries(provider.id, capability.resourceType)"
                  :key="`${entry.resourceType}:${entry.resourceId}`"
                  type="button"
                  class="rounded-full border border-default px-3 py-1 text-xs text-muted hover:border-error hover:text-error"
                  :data-test="`remove-resource-${provider.id}-${capability.resourceType}-${entry.resourceId}`"
                  @click="
                    handleRemoveResource(provider.id, capability.resourceType, entry.resourceId)
                  "
                >
                  {{ entry.resourceId }}
                </button>
              </div>

              <div
                v-if="isPickerOpen(provider.id, capability.resourceType)"
                class="space-y-3 rounded-lg border border-default bg-muted/20 p-3"
                :data-test="`resource-picker-${provider.id}-${capability.resourceType}`"
              >
                <div class="flex flex-col gap-2 sm:flex-row">
                  <input
                    v-model="
                      resourcePickerSearch[resourceKey(provider.id, capability.resourceType)]
                    "
                    type="text"
                    class="min-w-0 flex-1 rounded-md border border-default bg-default px-3 py-2 text-sm outline-none"
                    placeholder="搜索资源…"
                    :data-test="`resource-search-${provider.id}-${capability.resourceType}`"
                    @keyup.enter="loadResourceOptions(provider.id, capability.resourceType)"
                  />
                  <div class="flex gap-2">
                    <UButton
                      size="xs"
                      variant="soft"
                      color="neutral"
                      :loading="
                        integrationProvidersStore.isResourceLoading(
                          provider.id,
                          capability.resourceType
                        )
                      "
                      @click="loadResourceOptions(provider.id, capability.resourceType)"
                    >
                      搜索
                    </UButton>
                    <UButton
                      size="xs"
                      variant="soft"
                      color="neutral"
                      :loading="
                        integrationProvidersStore.isResourceLoading(
                          provider.id,
                          capability.resourceType
                        )
                      "
                      @click="
                        loadResourceOptions(provider.id, capability.resourceType, { refresh: true })
                      "
                    >
                      刷新
                    </UButton>
                  </div>
                </div>

                <p
                  v-if="resourcePickerErrors[resourceKey(provider.id, capability.resourceType)]"
                  class="text-xs text-error"
                >
                  {{ resourcePickerErrors[resourceKey(provider.id, capability.resourceType)] }}
                </p>

                <div
                  v-if="
                    !integrationProvidersStore.isResourceLoading(
                      provider.id,
                      capability.resourceType
                    ) && getResourceOptions(provider.id, capability.resourceType).length === 0
                  "
                  class="rounded-md border border-dashed border-default px-3 py-4 text-xs text-muted"
                >
                  暂无可选资源，请尝试调整搜索条件或刷新列表。
                </div>

                <div v-else class="max-h-64 space-y-2 overflow-y-auto">
                  <label
                    v-for="resource in getResourceOptions(provider.id, capability.resourceType)"
                    :key="resource.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border border-default bg-default px-3 py-2"
                    :data-test="`resource-option-${provider.id}-${capability.resourceType}-${resource.id}`"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5"
                      :checked="
                        (
                          resourcePickerSelection[
                            resourceKey(provider.id, capability.resourceType)
                          ] ?? []
                        ).includes(resource.id)
                      "
                      @change="
                        toggleResourceSelection(
                          provider.id,
                          capability.resourceType,
                          resource.id,
                          ($event.target as HTMLInputElement).checked
                        )
                      "
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium text-highlighted">
                        {{ resource.name }}
                      </span>
                      <span
                        v-if="resource.subtitle || resource.parentName"
                        class="block text-xs text-muted"
                      >
                        {{ resource.parentName ? `${resource.parentName} · ` : ""
                        }}{{ resource.subtitle ?? "" }}
                      </span>
                      <span class="block text-[11px] text-muted">{{ resource.id }}</span>
                    </span>
                  </label>
                </div>

                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs text-muted">
                    已选
                    {{
                      (
                        resourcePickerSelection[
                          resourceKey(provider.id, capability.resourceType)
                        ] ?? []
                      ).length
                    }}
                    项
                  </p>
                  <div class="flex gap-2">
                    <UButton size="xs" variant="ghost" color="neutral" @click="closeResourcePicker">
                      取消
                    </UButton>
                    <UButton
                      size="xs"
                      color="primary"
                      :data-test="`confirm-picker-${provider.id}-${capability.resourceType}`"
                      @click="applyResourceSelection(provider.id, capability.resourceType)"
                    >
                      确认
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div class="rounded-xl border border-dashed border-default bg-muted/10 px-4 py-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">添加新平台</h3>
          <p class="text-xs text-muted">按当前阶段支持的 provider 追加挂载入口。</p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="provider in availableProviders"
          :key="provider.id"
          type="button"
          class="rounded-full border px-3 py-1 text-xs"
          :data-test="`add-provider-${provider.id}`"
          :class="
            provider.comingSoon
              ? 'cursor-not-allowed border-default text-muted opacity-60'
              : 'border-default text-highlighted hover:border-primary/40'
          "
          @click="handleAddProvider(provider)"
        >
          {{ provider.name
          }}{{
            provider.comingSoon
              ? " · 即将推出"
              : integrationProvidersStore.getProviderStatus(provider.id) === "not-connected"
                ? " · 去设置连接"
                : integrationProvidersStore.getProviderStatus(provider.id) === "connected"
                  ? " · 添加资源"
                  : integrationProvidersStore.getProviderStatus(provider.id) === "expired"
                    ? " · 去设置处理"
                    : ""
          }}
        </button>
      </div>
    </div>
  </section>
</template>
