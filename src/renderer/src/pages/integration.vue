<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useWorkspaceStore, useIntegrationProvidersStore } from "@renderer/stores";
import ProviderStageSection from "@renderer/components/integration/ProviderStageSection.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import { workspaceKindLabel } from "@renderer/utils/workspace-presentation";

const workspaceStore = useWorkspaceStore();
const integrationProvidersStore = useIntegrationProvidersStore();

const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? "");
const currentSubjectLabel = computed(() => {
  const workspace = workspaceStore.currentWorkspace;
  return workspace ? workspaceKindLabel(workspace.kind) : "Project 或 Workspace";
});
const pageDescription = computed(
  () =>
    `为当前 ${currentSubjectLabel.value} 挂载各阶段需要的 provider 资源。连接与凭证管理统一在设置页处理。`
);

const searchQuery = computed({
  get: () => integrationProvidersStore.searchQuery,
  set: (value) => integrationProvidersStore.setSearchQuery(value),
});

onMounted(async () => {
  await integrationProvidersStore.loadProviders();
});

watch(
  currentWorkspaceId,
  async (workspaceId) => {
    await integrationProvidersStore.loadWorkspaceIntegration(workspaceId);
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-default">
    <div class="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <PageHeader eyebrow="Integrations" title="集成" :description="pageDescription" />

      <UInput v-model="searchQuery" placeholder="搜索 provider…" size="sm" class="w-full sm:w-96">
        <template #leading>
          <UIcon name="i-lucide-search" class="w-4 h-4 text-muted" />
        </template>
      </UInput>

      <div v-if="currentWorkspaceId" class="space-y-10">
        <ProviderStageSection
          v-for="category in integrationProvidersStore.categories"
          :key="category.id"
          :category="category"
          :providers="integrationProvidersStore.filteredProviders"
          :current-workspace-id="currentWorkspaceId"
          :workspace-folders="workspaceStore.currentWorkspace?.folders ?? []"
        />
      </div>

      <AppEmptyState
        v-else
        icon="i-lucide-folder-open"
        title="请先打开 Project 或 Workspace"
        description="打开 Project 或 Workspace 后，即可为其配置集成资源。"
      />
    </div>
  </div>
</template>
