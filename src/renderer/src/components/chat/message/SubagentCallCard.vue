<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { UIMessage } from "ai";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import {
  formatSubagentDuration,
  formatSubagentTokens,
  getSubagentSummary,
  resolveSubagentDisplayState,
  type SubagentCallProjection,
  type SubagentDisplayState,
} from "@renderer/utils/chatSubagent";
import SubagentCallSlideover from "./SubagentCallSlideover.vue";

const props = defineProps<{
  message: UIMessage;
  call: SubagentCallProjection;
  isCurrentStream: boolean;
  isDark: boolean;
}>();

const open = ref(false);
const triggerContainer = ref<HTMLElement | null>(null);

const rootPart = computed(() => props.call.root.part);
const summary = computed(() => getSubagentSummary(rootPart.value));
const displayState = computed(() =>
  resolveSubagentDisplayState(rootPart.value, props.isCurrentStream)
);

const title = computed(() => {
  if (rootPart.value.type !== "dynamic-tool") return String(rootPart.value.type);
  const input = (rootPart.value.input ?? {}) as Record<string, unknown>;
  if (typeof input.description === "string" && input.description.trim()) {
    return input.description;
  }
  return rootPart.value.title?.trim() || rootPart.value.toolName;
});

const statePresentation: Record<
  SubagentDisplayState,
  { label: string; color: "primary" | "success" | "error" | "neutral"; icon: string }
> = {
  running: { label: "正在运行", color: "primary", icon: "i-lucide-loader-circle" },
  completed: { label: "已完成", color: "success", icon: "i-lucide-circle-check" },
  failed: { label: "失败", color: "error", icon: "i-lucide-circle-x" },
  interrupted: { label: "已中断", color: "neutral", icon: "i-lucide-circle-stop" },
};

const state = computed(() => statePresentation[displayState.value]);
const metricSummary = computed(() => {
  const value = summary.value;
  if (!value) return [];
  const metrics: string[] = [];
  if (value.totalToolUseCount !== undefined) {
    metrics.push(`${new Intl.NumberFormat("zh-CN").format(value.totalToolUseCount)} 次工具调用`);
  }
  if (value.totalTokens !== undefined) {
    metrics.push(`${formatSubagentTokens(value.totalTokens)} tokens`);
  }
  if (value.totalDurationMs !== undefined) {
    metrics.push(formatSubagentDuration(value.totalDurationMs));
  }
  return metrics;
});

function focusTrigger(): void {
  void nextTick(() => triggerContainer.value?.querySelector<HTMLButtonElement>("button")?.focus());
}

watch(open, (isOpen, wasOpen) => {
  if (!isOpen && wasOpen) focusTrigger();
});
</script>

<template>
  <div ref="triggerContainer" class="my-4" data-test="subagent-call-card-host">
    <UiSurface
      as="button"
      interactive
      padding="sm"
      class="w-full text-left focus-visible:outline-2 focus-visible:outline-primary"
      data-test="subagent-call-card"
      :aria-expanded="String(open)"
      :aria-label="`查看子 Agent 调用：${title}`"
      @click="open = true"
    >
      <div class="flex items-start gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <UIcon
            name="i-lucide-waypoints"
            class="size-5 text-primary"
            data-test="subagent-call-icon"
          />
        </div>

        <div class="min-w-0 flex-1 space-y-2">
          <div class="flex items-start justify-between gap-3">
            <span
              class="min-w-0 break-words text-base leading-6 font-semibold text-highlighted"
              data-test="subagent-call-name"
            >
              {{ title }}
            </span>
            <UIcon name="i-lucide-panel-right-open" class="mt-1 size-4 shrink-0 text-muted" />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="summary?.agentType"
              class="text-sm font-medium text-default"
              data-test="subagent-agent-type"
            >
              {{ summary.agentType }}
            </span>
            <UBadge :color="state.color" variant="soft" size="xs">
              <span class="inline-flex items-center gap-1">
                <UIcon
                  :name="state.icon"
                  class="size-3"
                  :class="displayState === 'running' ? 'animate-spin' : ''"
                />
                {{ state.label }}
              </span>
            </UBadge>
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span v-for="metric in metricSummary" :key="metric">{{ metric }}</span>
            <span v-if="metricSummary.length === 0">
              {{ props.call.descendants.length }} 个已记录活动
            </span>
          </div>
        </div>
      </div>
    </UiSurface>

    <SubagentCallSlideover
      v-if="open"
      :open="open"
      :message="props.message"
      :root-tool-call-id="rootPart.toolCallId"
      :is-current-stream="props.isCurrentStream"
      :is-dark="props.isDark"
      @update:open="open = $event"
    />
  </div>
</template>
