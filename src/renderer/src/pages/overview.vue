<script setup lang="ts">
import { watch } from "vue";
import OverviewActiveChanges from "@renderer/components/overview/OverviewActiveChanges.vue";
import OverviewGovernance from "@renderer/components/overview/OverviewGovernance.vue";
import OverviewRecentLineages from "@renderer/components/overview/OverviewRecentLineages.vue";
import OverviewStatsBar from "@renderer/components/overview/OverviewStatsBar.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import { useOverviewStore, useProjectStore } from "@renderer/stores";

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
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="Overview"
          title="项目概览"
          description="治理状态、活跃工作和最近脉络。"
        />

        <div class="inline-flex items-center gap-2 text-xs text-muted">
          <span class="inline-flex size-2 rounded-full bg-success" />
          实时项目数据
        </div>
      </div>

      <div
        v-if="overviewStore.loading"
        class="grid grid-cols-1 gap-6 xl:grid-cols-12"
        data-test="overview-loading-skeleton"
      >
        <div class="space-y-6 xl:col-span-8">
          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <USkeleton class="h-4 w-24 rounded" />
              <USkeleton class="h-3 w-16 rounded" />
            </div>
            <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <USkeleton v-for="item in 2" :key="`change-${item}`" class="h-28 rounded-lg" />
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <USkeleton class="h-4 w-24 rounded" />
              <USkeleton class="h-3 w-16 rounded" />
            </div>
            <div class="space-y-2.5">
              <USkeleton v-for="item in 3" :key="`lineage-${item}`" class="h-24 rounded-lg" />
            </div>
          </section>
        </div>

        <div class="space-y-6 xl:col-span-4">
          <div class="rounded-lg bg-elevated p-5">
            <USkeleton class="h-3 w-20 rounded" />
            <USkeleton class="mt-4 h-16 w-16 rounded-full" />
            <div class="mt-5 grid grid-cols-2 gap-2">
              <USkeleton v-for="item in 4" :key="`stat-${item}`" class="h-16 rounded-lg" />
            </div>
          </div>
          <USkeleton class="h-52 rounded-lg" />
          <USkeleton class="h-56 rounded-lg" />
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

      <div
        v-else-if="overviewStore.data"
        class="grid grid-cols-1 gap-6 xl:grid-cols-12"
        data-test="overview-content-grid"
      >
        <div class="space-y-6 xl:col-span-8" data-test="overview-dynamic-column">
          <OverviewActiveChanges :changes="overviewStore.data.activeChanges" />

          <OverviewRecentLineages :lineages="overviewStore.data.recentLineages" />
        </div>

        <div class="space-y-6 xl:col-span-4" data-test="overview-governance-column">
          <OverviewStatsBar :stats="overviewStore.data.stats" />

          <OverviewGovernance :governance="overviewStore.data.governance" />
        </div>
      </div>
    </div>
  </div>
</template>
