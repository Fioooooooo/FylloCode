<script setup lang="ts">
import { computed, ref } from "vue";
import type { PlanEntry } from "@shared/types/chat";

// 形状对齐 ACP agent-plan：content / priority / status。
type PlanEntryStatus = PlanEntry["status"];
type PlanEntryPriority = PlanEntry["priority"];

const { entries } = defineProps<{
  entries: PlanEntry[];
}>();

const collapsed = ref(false);

const completedCount = computed(
  () => entries.filter((entry) => entry.status === "completed").length
);

const hasActive = computed(() => entries.some((entry) => entry.status === "in_progress"));

const statusConfig: Record<
  PlanEntryStatus,
  { icon: string; iconClass: string; textClass: string }
> = {
  completed: {
    icon: "i-lucide-check",
    iconClass: "text-success",
    textClass: "text-muted line-through",
  },
  in_progress: {
    icon: "i-lucide-loader-2",
    iconClass: "text-warning animate-spin",
    textClass: "text-highlighted font-medium",
  },
  pending: {
    icon: "i-lucide-circle",
    iconClass: "text-dimmed",
    textClass: "text-default",
  },
};

const priorityConfig: Record<PlanEntryPriority, { label: string; class: string }> = {
  high: { label: "高", class: "bg-error/10 text-error" },
  medium: { label: "中", class: "bg-warning/10 text-warning" },
  low: { label: "低", class: "bg-elevated text-muted" },
};
</script>

<template>
  <div
    v-if="entries.length > 0"
    class="mx-2 mb-0 rounded-lg border border-default bg-elevated/40 overflow-hidden"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-elevated/60 transition-colors"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span v-if="hasActive" class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
        <UIcon v-else name="i-lucide-list-checks" class="w-4 h-4 text-muted shrink-0" />
        <span class="text-sm font-medium text-highlighted">执行计划</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-xs text-muted tabular-nums">
          {{ completedCount }}/{{ entries.length }}
        </span>
        <UIcon
          :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
          class="w-4 h-4 text-muted"
        />
      </div>
    </button>

    <ul v-show="!collapsed" class="px-3 pb-2 space-y-1 border-t border-default pt-2">
      <li
        v-for="(entry, index) in entries"
        :key="index"
        class="flex items-start gap-2 text-sm leading-6"
      >
        <UIcon
          :name="statusConfig[entry.status].icon"
          class="w-4 h-4 mt-0.5 shrink-0"
          :class="statusConfig[entry.status].iconClass"
        />
        <span class="flex-1 min-w-0 break-words" :class="statusConfig[entry.status].textClass">
          {{ entry.content }}
        </span>
        <span
          class="shrink-0 text-xs px-1.5 py-0.5 rounded mt-0.5"
          :class="priorityConfig[entry.priority].class"
        >
          {{ priorityConfig[entry.priority].label }}
        </span>
      </li>
    </ul>
  </div>
</template>
