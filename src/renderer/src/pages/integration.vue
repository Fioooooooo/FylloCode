<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useProjectStore } from "@renderer/stores/project";
import { useIntegrationProvidersStore } from "@renderer/stores/integration.providers";
import ProviderStageSection from "@renderer/components/integration/ProviderStageSection.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";

const projectStore = useProjectStore();
const integrationProvidersStore = useIntegrationProvidersStore();

const currentProjectId = computed(() => projectStore.currentProject?.id ?? "");

const searchQuery = computed({
  get: () => integrationProvidersStore.searchQuery,
  set: (value) => integrationProvidersStore.setSearchQuery(value),
});

onMounted(async () => {
  await integrationProvidersStore.loadProviders();
});

watch(
  currentProjectId,
  async (projectId) => {
    await integrationProvidersStore.loadProjectIntegration(projectId);
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-default">
    <div class="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <PageHeader
        eyebrow="Integrations"
        title="集成"
        description="为当前项目挂载各阶段需要的 provider 资源。连接与凭证管理统一在设置页处理。"
      />

      <UInput v-model="searchQuery" placeholder="搜索 provider…" size="sm" class="w-full sm:w-96">
        <template #leading>
          <UIcon name="i-lucide-search" class="w-4 h-4 text-muted" />
        </template>
      </UInput>

      <div v-if="currentProjectId" class="space-y-10">
        <ProviderStageSection
          v-for="category in integrationProvidersStore.categories"
          :key="category.id"
          :category="category"
          :providers="integrationProvidersStore.filteredProviders"
          :current-project-id="currentProjectId"
        />
      </div>

      <AppEmptyState
        v-else
        icon="i-lucide-folder-open"
        title="请先打开一个项目"
        description="选择或创建一个项目后，即可为项目配置集成资源。"
      />
    </div>
  </div>
</template>
