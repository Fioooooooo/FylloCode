<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { timeAgo } from "@renderer/utils/time";
import type { OverviewStats } from "@renderer/stores/overview";

const props = defineProps<{
  stats: OverviewStats;
}>();

const router = useRouter();

const taskLinkedValue = computed(() =>
  props.stats.totalSubjects === 0 ? "-" : `${Math.round(props.stats.taskLinkedRatio * 100)}%`
);

const cards = computed(() => [
  {
    key: "specs",
    label: "能力规约",
    value: String(props.stats.specsCount),
    meta: `本月 +${props.stats.specsThisMonth}`,
    icon: "i-lucide-scroll-text",
  },
  {
    key: "archives",
    label: "归档提案",
    value: String(props.stats.archiveCount),
    meta: `本月 +${props.stats.archiveThisMonth}`,
    icon: "i-lucide-archive",
  },
  {
    key: "guidelines",
    label: "项目准则",
    value: String(props.stats.guidelinesCount),
    meta: props.stats.guidelinesLastUpdated
      ? `最近更新 ${timeAgo(new Date(props.stats.guidelinesLastUpdated))}`
      : "最近更新 -",
    icon: "i-lucide-book-open-check",
  },
  {
    key: "lineages",
    label: "溯源覆盖",
    value: taskLinkedValue.value,
    meta: props.stats.totalSubjects === 0 ? "暂无脉络" : `${props.stats.totalSubjects} 条演进脉络`,
    icon: "i-lucide-git-merge",
  },
]);

function openArchives(): void {
  void router.push("/proposal");
}
</script>

<template>
  <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-test="overview-stats">
    <template v-for="card in cards" :key="card.key">
      <button
        v-if="card.key === 'archives'"
        type="button"
        class="rounded-lg border border-default bg-elevated px-5 py-4 text-left transition-colors hover:bg-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-test="overview-archives-card"
        @click="openArchives"
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
      </button>

      <div
        v-else
        class="rounded-lg border border-default bg-elevated px-5 py-4"
        :data-test="`overview-stat-card-${card.key}`"
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
    </template>
  </section>
</template>
