<script setup lang="ts">
import { computed } from "vue";
import { timeAgo } from "@renderer/utils/time";
import type { OverviewStats } from "@renderer/stores/overview";

const props = defineProps<{
  stats: OverviewStats;
}>();

const taskDrivenValue = computed(() =>
  props.stats.totalSubjects === 0 ? "-" : `${Math.round(props.stats.taskDrivenRatio * 100)}%`
);

const cards = computed(() => [
  {
    key: "specs",
    label: "规范",
    value: String(props.stats.specsCount),
    meta: `本月 +${props.stats.specsThisMonth}`,
    icon: "i-lucide-scroll-text",
  },
  {
    key: "archives",
    label: "归档变更",
    value: String(props.stats.archiveCount),
    meta: `本月 +${props.stats.archiveThisMonth}`,
    icon: "i-lucide-archive",
  },
  {
    key: "guidelines",
    label: "Guidelines",
    value: String(props.stats.guidelinesCount),
    meta: props.stats.guidelinesLastUpdated
      ? `最近更新 ${timeAgo(new Date(props.stats.guidelinesLastUpdated))}`
      : "最近更新 -",
    icon: "i-lucide-book-open-check",
  },
  {
    key: "task-driven",
    label: "任务驱动",
    value: taskDrivenValue.value,
    meta: props.stats.totalSubjects === 0 ? "暂无线索数据" : `${props.stats.totalSubjects} 条线索`,
    icon: "i-lucide-git-merge",
  },
]);
</script>

<template>
  <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-test="overview-stats">
    <div
      v-for="card in cards"
      :key="card.key"
      class="rounded-lg border border-default bg-elevated px-5 py-4"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <p class="text-xs text-muted">{{ card.label }}</p>
          <p class="text-2xl font-bold tracking-tight leading-8 text-highlighted">
            {{ card.value }}
          </p>
          <p class="truncate text-xs text-muted">{{ card.meta }}</p>
        </div>
        <div class="flex size-5 shrink-0 items-center justify-center text-muted">
          <UIcon :name="card.icon" class="size-4" />
        </div>
      </div>
    </div>
  </section>
</template>
