<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { OverviewStats } from "@renderer/stores";

const props = defineProps<{
  stats: OverviewStats;
  knowledgeCount: number;
  knowledgeAttentionCount: number;
  knowledgeLoading: boolean;
  knowledgeError: string | null;
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
    background: `conic-gradient(from -90deg, var(--overview-health-ring-progress) ${percent * 3.6}deg, var(--overview-health-ring-track) 0deg)`,
  };
});

type StatCardKey = "specs" | "archives" | "guidelines" | "knowledge";
type StatRoute = "/specs" | "/proposal" | "/guidelines" | "/knowledge";

type StatCard = {
  key: StatCardKey;
  label: string;
  value: string;
  meta?: string;
  route: StatRoute;
};

const knowledgeValue = computed(() => {
  if (props.knowledgeLoading) {
    return "正在加载…";
  }
  if (props.knowledgeError) {
    return "暂不可用";
  }
  return String(props.knowledgeCount);
});

const knowledgeMeta = computed(() => {
  if (!props.knowledgeLoading && !props.knowledgeError && props.knowledgeAttentionCount > 0) {
    return `${props.knowledgeAttentionCount} 条需关注`;
  }
  return undefined;
});

const cards = computed<StatCard[]>(() => [
  {
    key: "specs",
    label: "能力规约",
    value: String(props.stats.specsCount),
    route: "/specs",
  },
  {
    key: "archives",
    label: "归档提案",
    value: String(props.stats.archiveCount),
    route: "/proposal",
  },
  {
    key: "guidelines",
    label: "项目准则",
    value: String(props.stats.guidelinesCount),
    route: "/guidelines",
  },
  {
    key: "knowledge",
    label: "知识沉淀",
    value: knowledgeValue.value,
    meta: knowledgeMeta.value,
    route: "/knowledge",
  },
]);

function openCard(route: StatRoute): void {
  void router.push(route);
}
</script>

<template>
  <section
    class="overview-health-card relative overflow-hidden rounded-lg bg-gradient-to-br from-teal-500 via-teal-500 to-teal-600 p-5 text-white before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/15 before:via-transparent before:to-black/10 dark:from-cyan-800 dark:via-teal-800 dark:to-cyan-900"
    data-test="overview-stats"
    data-test-section="overview-governance-health"
  >
    <div class="relative flex items-center gap-4" data-test="overview-governance-health">
      <div class="relative size-[92px] shrink-0 rounded-full" :style="ringStyle" aria-hidden="true">
        <div
          class="overview-health-ring-core absolute inset-[13px] flex items-center justify-center rounded-full"
        >
          <span class="overview-health-ring-value text-xl font-bold tracking-tight">
            {{ taskLinkedValue }}
          </span>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold tracking-wide text-white/85 dark:text-teal-100/90">
          治理健康
        </p>
        <h2 class="mt-1 text-lg font-bold leading-7 text-white">
          {{ governanceSummary }}
        </h2>
        <p class="mt-1 text-xs text-white/75 dark:text-teal-100/70">{{ governanceMeta }}</p>
      </div>
    </div>

    <div class="relative mt-5 h-px bg-white/15 dark:bg-teal-300/15" />

    <div class="relative mt-4 grid grid-cols-3 gap-2.5" data-test="overview-governance-entry-grid">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="cursor-pointer rounded-xl bg-white/10 px-2 py-2 text-center text-white transition-colors duration-150 hover:bg-white/[.17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 dark:bg-teal-300/10 dark:hover:bg-teal-300/20 dark:focus-visible:ring-teal-300/50"
        :data-test="`overview-${card.key}-card`"
        @click="openCard(card.route)"
      >
        <span class="flex min-w-0 flex-col items-center gap-1.5">
          <span
            class="flex max-w-full items-center justify-center gap-1 text-[11px] leading-4 text-white/[.88] dark:text-teal-100/[.72]"
          >
            <span class="truncate">{{ card.label }}</span>
            <span class="text-white/70 dark:text-teal-300" aria-hidden="true">›</span>
          </span>
          <span class="flex items-center justify-center gap-1">
            <span
              class="text-center text-lg font-bold leading-6 tracking-tight text-white"
              :data-test="`overview-${card.key}-value`"
            >
              {{ card.value }}
            </span>
            <UTooltip
              v-if="card.meta"
              :text="card.meta"
              :delay-duration="200"
              :disable-hoverable-content="true"
            >
              <UIcon
                name="i-lucide-circle-alert"
                class="size-3.5 shrink-0 text-white/70 dark:text-teal-100/65"
                aria-hidden="true"
                data-test="overview-knowledge-meta-tip"
              />
            </UTooltip>
            <span v-if="card.meta" class="sr-only" :data-test="`overview-${card.key}-meta`">
              {{ card.meta }}
            </span>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.overview-health-card {
  --overview-health-ring-progress: #99f6e4;
  --overview-health-ring-track: rgb(255 255 255 / 0.2);
  --overview-health-ring-core: rgb(15 118 110);
  --overview-health-ring-text: #ffffff;
}

.dark .overview-health-card {
  --overview-health-ring-progress: #2dd4bf;
  --overview-health-ring-track: rgb(255 255 255 / 0.12);
  --overview-health-ring-core: rgb(19 78 74);
  --overview-health-ring-text: #eafbf6;
}

.overview-health-ring-core {
  background: var(--overview-health-ring-core);
}

.overview-health-ring-value {
  color: var(--overview-health-ring-text);
}
</style>
