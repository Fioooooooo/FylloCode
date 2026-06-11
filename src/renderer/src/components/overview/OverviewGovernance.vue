<script setup lang="ts">
import { computed } from "vue";
import { timeAgo } from "@renderer/utils/time";
import type { GovernanceEvolution, SpecsGrowthBucket } from "@renderer/stores/overview";

const props = defineProps<{
  governance: GovernanceEvolution;
}>();

const maxSpecsCount = computed(() =>
  Math.max(...props.governance.specsGrowth.map((bucket) => bucket.cumulativeCount), 0)
);

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

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(new Date(value));
}

function formatCount(value: number): string {
  return `${value} 个`;
}
</script>

<template>
  <section class="space-y-3" data-test="overview-governance">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-highlighted">治理演化</h2>
      <span class="text-xs text-muted">近 8 周</span>
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div class="rounded-lg border border-default bg-elevated px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-medium text-highlighted">规范增长</h3>
            <p class="mt-1 text-xs text-muted">累计 specs 趋势</p>
          </div>
          <UIcon name="i-lucide-chart-column" class="size-4 text-muted" />
        </div>

        <div
          v-if="governance.specsGrowth.length > 0"
          class="mt-5 flex h-32 items-end gap-1.5"
          aria-label="规范增长柱状图"
        >
          <div
            v-for="bucket in governance.specsGrowth"
            :key="bucket.weekStart"
            class="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
            :title="`${bucket.weekStart}: ${formatCount(bucket.cumulativeCount)}`"
          >
            <span
              class="text-[10px] leading-none text-muted opacity-0 transition-opacity group-hover:opacity-100"
            >
              {{ bucket.cumulativeCount }}
            </span>
            <div class="flex h-24 w-full items-end rounded-t-sm bg-muted/20">
              <div
                class="w-full rounded-t-sm bg-neutral-300 dark:bg-neutral-700 transition-colors group-hover:bg-neutral-400 dark:group-hover:bg-neutral-600"
                :style="{ height: barHeight(bucket) }"
              />
            </div>
          </div>
        </div>

        <div v-else class="mt-5 rounded-md bg-muted/30 px-3 py-8 text-center">
          <UIcon name="i-lucide-chart-column" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">暂无规范趋势</p>
        </div>

        <div class="mt-4 flex items-center justify-between text-xs text-muted">
          <span>{{ startLabel }}</span>
          <span v-if="governance.specsGrowth.length > 0">
            累计 {{ governance.specsGrowth.at(-1)?.cumulativeCount ?? 0 }}
          </span>
          <span>{{ endLabel }}</span>
        </div>
      </div>

      <div class="rounded-lg border border-default bg-elevated px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-medium text-highlighted">Guidelines 演化</h3>
            <p class="mt-1 text-xs text-muted">最近更新的项目规范</p>
          </div>
          <UIcon name="i-lucide-book-marked" class="size-4 text-muted" />
        </div>

        <div
          v-if="governance.recentGuidelines.length === 0"
          class="mt-5 rounded-md bg-muted/30 px-3 py-8 text-center text-sm text-muted"
        >
          暂无 guideline 更新
        </div>

        <div v-else class="mt-4 divide-y divide-default">
          <div
            v-for="item in governance.recentGuidelines"
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
      </div>
    </div>
  </section>
</template>
