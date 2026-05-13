<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useProjectStore } from "@renderer/stores/project";
import { useIntegrationProvidersStore } from "@renderer/stores/integration.providers";
import ProviderStageSection from "@renderer/components/integration/ProviderStageSection.vue";

const projectStore = useProjectStore();
const integrationProvidersStore = useIntegrationProvidersStore();

const currentProjectId = computed(() => projectStore.currentProject?.id ?? "");

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
    <div class="max-w-240 mx-auto px-6 py-8 space-y-8">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold text-highlighted">集成</h1>
        <p class="text-sm text-muted">
          为当前项目挂载各阶段需要的 provider 资源。连接与凭证管理统一在设置页处理。
        </p>
      </div>

      <UInput
        :model-value="integrationProvidersStore.searchQuery"
        placeholder="搜索 provider..."
        @input="integrationProvidersStore.setSearchQuery(($event.target as HTMLInputElement).value)"
      />

      <div v-if="currentProjectId" class="space-y-10">
        <ProviderStageSection
          v-for="category in integrationProvidersStore.categories"
          :key="category.id"
          :category="category"
          :providers="integrationProvidersStore.filteredProviders"
          :current-project-id="currentProjectId"
        />
      </div>

      <div
        v-else
        class="rounded-xl border border-dashed border-default bg-muted/10 px-4 py-6 text-sm text-muted"
      >
        请先打开一个项目，再配置该项目的集成资源。
      </div>
    </div>
  </div>
</template>
