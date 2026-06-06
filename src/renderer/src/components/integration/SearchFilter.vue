<script setup lang="ts">
import { computed } from "vue";
import type { FilterOption } from "@shared/types/integration";
import { useIntegrationStore } from "@renderer/stores/integration";
import { useProjectStore } from "@renderer/stores/project";

const integrationStore = useIntegrationStore();
const projectStore = useProjectStore();

const searchQuery = computed({
  get: () => integrationStore.searchQuery,
  set: (val) => integrationStore.setSearchQuery(val),
});

const filterOption = computed({
  get: () => integrationStore.filterOption,
  set: (val) => integrationStore.setFilterOption(val),
});

const filterOptions = computed<{ label: string; value: FilterOption; disabled?: boolean }[]>(() => [
  { label: "全部", value: "all" },
  { label: "已连接", value: "connected" },
  { label: "项目中已启用", value: "enabled-in-project", disabled: !projectStore.hasCurrentProject },
]);

function onSearchInput(event: Event): void {
  searchQuery.value = (event.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="flex items-center gap-3">
    <UInput
      :model-value="searchQuery"
      placeholder="搜索集成..."
      class="w-64"
      size="sm"
      @input="onSearchInput"
    >
      <template #leading>
        <UIcon name="i-lucide-search" class="w-4 h-4 text-muted" />
      </template>
    </UInput>

    <USelect v-model="filterOption" :items="filterOptions" size="sm" class="w-44" />
  </div>
</template>
