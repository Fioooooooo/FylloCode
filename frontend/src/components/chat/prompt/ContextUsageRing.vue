<script setup lang="ts">
import { computed } from "vue";
import type { TokenUsage } from "@shared/types/chat";

const props = defineProps<TokenUsage>();

const radius = 13;
const circumference = 2 * Math.PI * radius;

const percent = computed(() => {
  if (props.size <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (props.used / props.size) * 100));
});

const percentValueLabel = computed(() => `${Math.round(percent.value)}`);
const percentLabel = computed(() => `${percentValueLabel.value}%`);
const remaining = computed(() => Math.max(0, props.size - props.used));
const strokeOffset = computed(() => circumference * (1 - percent.value / 100));
const tooltipRows = computed(() => {
  const rows = [
    {
      label: "Context",
      value: `${formatTokens(props.used)} / ${formatTokens(props.size)} tokens (${percentLabel.value})`,
    },
    {
      label: "Remaining",
      value: `${formatTokens(remaining.value)} tokens`,
    },
  ];

  if (props.cost) {
    rows.push({
      label: "Cost",
      value: formatCost(props.cost.amount, props.cost.currency),
    });
  }

  return rows;
});
const usageColorClass = computed(() => {
  if (percent.value >= 80) {
    return "text-error";
  }

  if (percent.value >= 50) {
    return "text-warning";
  }

  return "text-success";
});

const tooltipText = computed(() =>
  tooltipRows.value.map((row) => `${row.label}: ${row.value}`).join("\n")
);

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  const k = value / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
}

function formatCost(amount: number, currency: string): string {
  return `${new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 6,
  }).format(amount)} ${currency}`;
}
</script>

<template>
  <UTooltip
    :delay-duration="200"
    :ui="{
      content: 'h-auto items-stretch gap-0 px-3 py-2 text-xs leading-5',
    }"
  >
    <template #content>
      <div class="space-y-1 text-xs">
        <div v-for="row in tooltipRows" :key="row.label" class="flex items-center gap-2">
          <span class="text-muted">{{ row.label }}:</span>
          <span class="font-medium text-highlighted">{{ row.value }}</span>
        </div>
      </div>
    </template>

    <div
      class="inline-flex h-8 min-w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted/50"
      aria-label="Context usage"
    >
      <svg class="h-7 w-7" viewBox="0 0 32 32" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          :r="radius"
          class="text-muted/25"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
        />
        <circle
          cx="16"
          cy="16"
          :r="radius"
          :class="usageColorClass"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeOffset"
          transform="rotate(-90 16 16)"
        />
        <text x="16" y="17" class="fill-current" text-anchor="middle" dominant-baseline="middle">
          <tspan class="text-[12px] font-bold">{{ percentValueLabel }}</tspan>
          <tspan class="text-[7px] font-semibold">%</tspan>
        </text>
      </svg>
      <span class="sr-only">{{ tooltipText }}</span>
    </div>
  </UTooltip>
</template>
