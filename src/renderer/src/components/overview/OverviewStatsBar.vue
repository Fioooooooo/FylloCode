<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { OverviewStats } from "@renderer/stores/overview";

const props = defineProps<{
  stats: OverviewStats;
}>();

const router = useRouter();

const taskLinkedPercent = computed(() =>
  props.stats.totalSubjects === 0 ? null : Math.round(props.stats.taskLinkedRatio * 100)
);

const taskLinkedValue = computed(() =>
  taskLinkedPercent.value === null ? "-" : `${taskLinkedPercent.value}%`
);

const governanceSummary = computed(() =>
  taskLinkedPercent.value === null ? "暂无可评估脉络" : "演进追溯覆盖"
);

const governanceMeta = computed(() =>
  props.stats.totalSubjects === 0
    ? "从任务或聊天开始建立治理脉络"
    : `基于 ${props.stats.totalSubjects} 条项目脉络统计`
);

const ringStyle = computed(() => {
  const percent = Math.min(100, Math.max(0, taskLinkedPercent.value ?? 0));
  return {
    background: `conic-gradient(rgb(255 255 255 / 0.96) ${percent * 3.6}deg, rgb(255 255 255 / 0.22) 0deg)`,
  };
});

type StatCardKey = "specs" | "archives" | "guidelines";

type StatCard = {
  key: StatCardKey;
  label: string;
  value: string;
};

const cards = computed<StatCard[]>(() => [
  {
    key: "specs",
    label: "能力规约",
    value: String(props.stats.specsCount),
  },
  {
    key: "archives",
    label: "归档提案",
    value: String(props.stats.archiveCount),
  },
  {
    key: "guidelines",
    label: "项目准则",
    value: String(props.stats.guidelinesCount),
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
  <section
    class="relative overflow-hidden rounded-lg bg-gradient-to-br from-teal-500 via-teal-500 to-teal-600 p-5 text-white before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/15 before:via-transparent before:to-black/10 dark:from-cyan-800 dark:via-teal-800 dark:to-cyan-900"
    data-test="overview-stats"
    data-test-section="overview-governance-health"
  >
    <div class="relative flex items-center gap-4" data-test="overview-governance-health">
      <div
        class="flex size-16 shrink-0 items-center justify-center rounded-full"
        :style="ringStyle"
        aria-hidden="true"
      >
        <div
          class="flex size-12 items-center justify-center rounded-full bg-teal-700 dark:bg-teal-950"
        >
          <span class="text-lg font-semibold tracking-tight">{{ taskLinkedValue }}</span>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold tracking-wide text-white/90">治理健康</p>
        <h2 class="mt-1 text-lg font-semibold leading-7 text-white">
          {{ governanceSummary }}
        </h2>
        <p class="mt-1 text-xs text-white/70">{{ governanceMeta }}</p>
      </div>
    </div>

    <div class="relative mt-5 grid grid-cols-3 gap-2">
      <component
        :is="isInteractiveCard(card.key) ? 'button' : 'div'"
        v-for="card in cards"
        :key="card.key"
        :type="isInteractiveCard(card.key) ? 'button' : undefined"
        :class="[
          'rounded-md px-1 py-1 text-center text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
          isInteractiveCard(card.key) ? 'cursor-pointer hover:text-white/80' : '',
        ]"
        :data-test="
          isInteractiveCard(card.key)
            ? `overview-${card.key}-card`
            : `overview-stat-card-${card.key}`
        "
        @click="openCard(card.key)"
      >
        <div class="flex min-w-0 flex-col items-center gap-1.5">
          <p
            class="flex min-w-0 items-center justify-center gap-1 text-center text-[11px] leading-4 text-white/75"
          >
            <span class="truncate">{{ card.label }}</span>
            <UIcon
              v-if="isInteractiveCard(card.key)"
              name="i-lucide-arrow-up-right"
              class="size-3 shrink-0 text-white/75"
            />
          </p>
          <p class="text-center text-lg font-semibold leading-6 tracking-tight text-white">
            {{ card.value }}
          </p>
        </div>
      </component>
    </div>
  </section>
</template>
