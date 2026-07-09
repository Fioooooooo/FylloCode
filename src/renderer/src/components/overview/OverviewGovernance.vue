<script setup lang="ts">
import { computed } from "vue";
import { timeAgo } from "@renderer/utils/time";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import type { GovernanceEvolution, SpecsGrowthBucket } from "@renderer/stores";

const props = defineProps<{
  governance: GovernanceEvolution;
}>();

const maxSpecsCount = computed(() =>
  Math.max(...props.governance.specsGrowth.map((bucket) => bucket.cumulativeCount), 0)
);

const barToneClasses = [
  "bg-primary/30",
  "bg-primary/40",
  "bg-primary/50",
  "bg-primary/60",
  "bg-primary/70",
  "bg-primary/80",
  "bg-primary/90",
];

const startLabel = computed(() => {
  const first = props.governance.specsGrowth[0];
  return first ? formatMonth(first.weekStart) : "-";
});

const endLabel = computed(() => {
  const last = props.governance.specsGrowth.at(-1);
  return last ? formatMonth(last.weekStart) : "-";
});

function barHeight(bucket: SpecsGrowthBucket): string {
  if (maxSpecsCount.value <= 0) {
    return "10%";
  }

  const ratio = bucket.cumulativeCount / maxSpecsCount.value;
  return `${Math.max(12, Math.round(ratio * 100))}%`;
}

function barColorClass(index: number): string {
  const lastIndex = props.governance.specsGrowth.length - 1;
  if (lastIndex <= 0) {
    return barToneClasses.at(-1) ?? "bg-primary/80";
  }

  const toneIndex = Math.round((index / lastIndex) * (barToneClasses.length - 1));
  return barToneClasses[toneIndex] ?? "bg-primary/80";
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(new Date(value));
}

function formatWeekStart(value: string): string {
  const formatted = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(
    new Date(value)
  );
  return `${formatted}当周`;
}

function formatCount(value: number): string {
  return `${value} 个`;
}
</script>

<template>
  <section class="space-y-6" data-test="overview-governance">
    <UiSurface
      variant="flat"
      class="border border-default !bg-default"
      data-test="overview-specs-growth"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium text-highlighted">规约增长</h3>
          <p class="mt-1 text-xs text-muted">累计 specs 趋势</p>
        </div>
        <UIcon name="i-lucide-chart-column" class="size-4 text-muted" />
      </div>

      <div
        v-if="props.governance.specsGrowth.length > 0"
        class="mt-4 flex h-24 items-end gap-1.5"
        aria-label="规约增长柱状图"
      >
        <div
          v-for="(bucket, index) in props.governance.specsGrowth"
          :key="bucket.weekStart"
          class="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
          :title="`${formatWeekStart(bucket.weekStart)}: ${formatCount(bucket.cumulativeCount)}`"
        >
          <span
            class="text-[10px] leading-none text-muted opacity-0 transition-opacity group-hover:opacity-100"
          >
            {{ bucket.cumulativeCount }}
          </span>
          <div class="flex h-16 w-full items-end rounded-t-sm bg-muted/20">
            <div
              :class="[
                'w-full rounded-t-sm transition-opacity duration-150 group-hover:opacity-90',
                barColorClass(index),
              ]"
              :style="{ height: barHeight(bucket) }"
            />
          </div>
        </div>
      </div>

      <AppEmptyState
        v-else
        compact
        icon="i-lucide-chart-column"
        title="暂无规约趋势"
        description="近 8 周没有可展示的规约增长数据。"
      />

      <div class="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{{ startLabel }}</span>
        <span v-if="props.governance.specsGrowth.length > 0">
          累计 {{ props.governance.specsGrowth.at(-1)?.cumulativeCount ?? 0 }}
        </span>
        <span>{{ endLabel }}</span>
      </div>
    </UiSurface>

    <UiSurface
      variant="flat"
      class="border border-default !bg-default"
      data-test="overview-guideline-evolution"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium text-highlighted">准则演化</h3>
          <p class="mt-1 text-xs text-muted">最近更新的项目 Guidelines 规范</p>
        </div>
        <UIcon name="i-lucide-book-marked" class="size-4 text-muted" />
      </div>

      <AppEmptyState
        v-if="props.governance.recentGuidelines.length === 0"
        compact
        icon="i-lucide-book-marked"
        title="暂无 guideline 更新"
        description="近 8 周没有 guideline 更新记录。"
      />

      <div v-else class="mt-4 divide-y divide-default">
        <div
          v-for="item in props.governance.recentGuidelines"
          :key="item.fileName"
          class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5"
        >
          <div class="min-w-0">
            <p class="flex min-w-0 items-center gap-1.5 text-sm font-medium text-highlighted">
              <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-muted" />
              <span class="truncate font-mono text-xs bg-muted/40 px-1 rounded">{{
                item.fileName
              }}</span>
            </p>
            <p class="mt-0.5 truncate text-xs text-muted" :title="item.lastCommitMessage">
              {{ item.lastCommitMessage }}
            </p>
          </div>
          <span class="pt-0.5 text-xs text-muted">
            {{ timeAgo(new Date(item.lastCommitDate)) }}
          </span>
        </div>
      </div>
    </UiSurface>
  </section>
</template>
