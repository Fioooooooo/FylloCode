<script setup lang="ts">
import { watch } from "vue";
import OverviewActiveChanges from "@renderer/components/overview/OverviewActiveChanges.vue";
import OverviewGovernance from "@renderer/components/overview/OverviewGovernance.vue";
import OverviewRecentThreads from "@renderer/components/overview/OverviewRecentThreads.vue";
import OverviewStatsBar from "@renderer/components/overview/OverviewStatsBar.vue";
import { useOverviewStore } from "@renderer/stores/overview";
import { useProjectStore } from "@renderer/stores/project";

const projectStore = useProjectStore();
const overviewStore = useOverviewStore();

watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    if (projectId) {
      void overviewStore.load();
    } else {
      overviewStore.clear();
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-default">
    <div class="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold text-highlighted">项目概览</h1>
          <p class="text-sm text-muted">治理状态、活跃工作和最近脉络。</p>
        </div>
        <div class="inline-flex items-center gap-2 text-xs text-muted">
          <span class="inline-flex size-2 rounded-full bg-success" />
          实时项目数据
        </div>
      </div>

      <div v-if="overviewStore.loading" class="space-y-6" data-test="overview-loading-skeleton">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
          <div
            v-for="item in 4"
            :key="`stat-${item}`"
            class="rounded-lg border border-default bg-elevated px-4 py-3 xl:px-5 xl:py-4"
          >
            <USkeleton class="h-3 w-16 rounded" />
            <USkeleton class="mt-3 h-8 w-20 rounded" />
            <USkeleton class="mt-2 h-3 w-24 rounded" />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <USkeleton v-for="item in 2" :key="`change-${item}`" class="h-28 rounded-lg" />
        </div>

        <div class="space-y-2.5">
          <USkeleton v-for="item in 3" :key="`thread-${item}`" class="h-24 rounded-lg" />
        </div>
      </div>

      <div
        v-else-if="overviewStore.error"
        class="rounded-lg border border-error/30 bg-error/5 px-4 py-4"
      >
        <div class="flex items-start gap-2 text-sm text-error">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>{{ overviewStore.error }}</span>
        </div>
      </div>

      <template v-else-if="overviewStore.data">
        <OverviewStatsBar :stats="overviewStore.data.stats" />

        <OverviewActiveChanges :changes="overviewStore.data.activeChanges" />

        <OverviewRecentThreads :threads="overviewStore.data.recentThreads" />

        <OverviewGovernance :governance="overviewStore.data.governance" />
      </template>
    </div>
  </div>
</template>
