<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { timeAgo } from "@renderer/utils/time";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import type { OverviewStats } from "@renderer/stores/overview";

const props = defineProps<{
  stats: OverviewStats;
}>();

const router = useRouter();

const taskLinkedValue = computed(() =>
  props.stats.totalSubjects === 0 ? "-" : `${Math.round(props.stats.taskLinkedRatio * 100)}%`
);

type StatCardKey = "specs" | "archives" | "guidelines" | "lineages";

type StatCard = {
  key: StatCardKey;
  label: string;
  value: string;
  meta: string;
  icon: string;
};

const cards = computed<StatCard[]>(() => [
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

function isInteractiveCard(key: StatCardKey): boolean {
  return key === "specs" || key === "archives";
}

function openSpecs(): void {
  void router.push("/specs");
}

function openArchives(): void {
  void router.push("/proposal");
}

function openCard(key: StatCardKey): void {
  if (key === "specs") {
    openSpecs();
    return;
  }

  if (key === "archives") {
    openArchives();
  }
}
</script>

<template>
  <section class="grid grid-cols-4 gap-4" data-test="overview-stats">
    <UiSurface
      v-for="card in cards"
      :key="card.key"
      :as="isInteractiveCard(card.key) ? 'button' : 'div'"
      :interactive="isInteractiveCard(card.key)"
      class="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :data-test="
        isInteractiveCard(card.key) ? `overview-${card.key}-card` : `overview-stat-card-${card.key}`
      "
      @click="openCard(card.key)"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <p class="text-xs text-muted">{{ card.label }}</p>
          <p class="text-2xl font-bold tracking-tight leading-8 text-highlighted">
            {{ card.value }}
          </p>
          <p class="truncate text-xs text-muted">{{ card.meta }}</p>
        </div>
        <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <UIcon :name="card.icon" class="size-5 text-primary/70" />
        </div>
      </div>
    </UiSurface>
  </section>
</template>
