<script setup lang="ts">
import { computed } from "vue";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { isToolStreaming } from "@nuxt/ui/utils/ai";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import { getToolIcon, getToolOutput, getToolSuffix, getToolText } from "@renderer/utils/chatTool";
import {
  formatSubagentDuration,
  formatSubagentTokens,
  getSubagentSummary,
  getSubagentToolStatRows,
  projectSubagentCalls,
  resolveSubagentDisplayState,
  type ChatToolPart,
  type SubagentDisplayState,
} from "@renderer/utils/chatSubagent";

const props = defineProps<{
  open: boolean;
  message: UIMessage;
  rootToolCallId: string;
  isCurrentStream: boolean;
  isDark: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const projection = computed(() => projectSubagentCalls(props.message.parts));
const call = computed(
  () =>
    projection.value.roots.find(
      (candidate) => candidate.root.part.toolCallId === props.rootToolCallId
    ) ?? null
);
const rootPart = computed(() => call.value?.root.part ?? null);
const summary = computed(() => (rootPart.value ? getSubagentSummary(rootPart.value) : undefined));
const displayState = computed<SubagentDisplayState>(() =>
  rootPart.value
    ? resolveSubagentDisplayState(rootPart.value, props.isCurrentStream)
    : "interrupted"
);

const stateLabels: Record<SubagentDisplayState, string> = {
  running: "正在运行",
  completed: "已完成",
  failed: "失败",
  interrupted: "已中断",
};

const stateColors: Record<SubagentDisplayState, "primary" | "success" | "error" | "neutral"> = {
  running: "primary",
  completed: "success",
  failed: "error",
  interrupted: "neutral",
};

const input = computed<Record<string, unknown>>(() => {
  const part = rootPart.value;
  return part?.type === "dynamic-tool" ? ((part.input ?? {}) as Record<string, unknown>) : {};
});
const title = computed(() => {
  const part = rootPart.value;
  if (!part) return "子 Agent 调用";
  if (part.type !== "dynamic-tool") return String(part.type);
  const description = input.value.description;
  return typeof description === "string" && description.trim()
    ? description
    : part.title?.trim() || part.toolName;
});
const prompt = computed(() =>
  typeof input.value.prompt === "string" && input.value.prompt.trim() ? input.value.prompt : null
);
const agentType = computed(() => {
  const type = summary.value?.agentType ?? input.value.subagent_type;
  return typeof type === "string" && type.trim() ? type : null;
});
const result = computed(() => {
  const part = rootPart.value;
  return part?.state === "output-available" ? getToolOutput(part) : null;
});
const toolStatRows = computed(() => getSubagentToolStatRows(summary.value?.toolStats));
const isSettledState = computed(() => displayState.value !== "running");

function toolInput(part: ChatToolPart): string | null {
  if (part.type !== "dynamic-tool") return null;
  const value = (part as DynamicToolUIPart).input;
  if (!value || (typeof value === "object" && Object.keys(value).length === 0)) return null;
  return JSON.stringify(value, null, 2);
}

function depthClass(depth: number): string {
  if (depth >= 4) return "pl-12";
  if (depth === 3) return "pl-8";
  if (depth === 2) return "pl-4";
  return "pl-0";
}
</script>

<template>
  <USlideover
    :open="props.open"
    :close="false"
    :ui="{
      content: 'w-[min(100vw,760px)] max-w-none',
      body: 'h-full min-h-0 p-0 sm:p-0',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col bg-default" data-test="subagent-slideover">
        <header class="shrink-0 border-b border-default px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-base font-semibold text-highlighted">{{ title }}</h2>
                <UBadge :color="stateColors[displayState]" variant="soft" size="xs">
                  {{ stateLabels[displayState] }}
                </UBadge>
                <UBadge v-if="agentType" color="neutral" variant="soft" size="xs">
                  {{ agentType }}
                </UBadge>
              </div>
              <p class="font-mono text-xs text-muted">
                {{ summary?.resolvedModel ?? "Model 未提供" }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="关闭子 Agent 详情"
              @click="emit('update:open', false)"
            />
          </div>
        </header>

        <div v-if="call" class="min-h-0 flex-1 space-y-6 overflow-auto px-5 py-4">
          <section aria-labelledby="subagent-metrics-title" class="space-y-3">
            <h3 id="subagent-metrics-title" class="text-sm font-semibold text-highlighted">
              运行摘要
            </h3>
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded-lg bg-elevated p-3">
                <p class="text-xs text-muted">Tokens</p>
                <p class="mt-1 text-sm font-medium text-highlighted" data-test="subagent-tokens">
                  {{ formatSubagentTokens(summary?.totalTokens) }}
                </p>
              </div>
              <div class="rounded-lg bg-elevated p-3">
                <p class="text-xs text-muted">耗时</p>
                <p class="mt-1 text-sm font-medium text-highlighted" data-test="subagent-duration">
                  {{ formatSubagentDuration(summary?.totalDurationMs) }}
                </p>
              </div>
              <div class="rounded-lg bg-elevated p-3">
                <p class="text-xs text-muted">工具调用</p>
                <p
                  class="mt-1 text-sm font-medium text-highlighted"
                  data-test="subagent-tool-count"
                >
                  {{
                    summary?.totalToolUseCount === undefined
                      ? "—"
                      : new Intl.NumberFormat("zh-CN").format(summary.totalToolUseCount)
                  }}
                </p>
              </div>
            </div>
            <div v-if="toolStatRows.length > 0" class="flex flex-wrap gap-2">
              <UBadge
                v-for="row in toolStatRows"
                :key="row.key"
                color="neutral"
                variant="soft"
                size="xs"
              >
                {{ row.label }} {{ row.value }}
              </UBadge>
            </div>
          </section>

          <section aria-labelledby="subagent-prompt-title" class="space-y-3">
            <h3 id="subagent-prompt-title" class="text-sm font-semibold text-highlighted">
              Prompt
            </h3>
            <pre
              v-if="prompt"
              class="whitespace-pre-wrap wrap-anywhere rounded-lg bg-elevated p-3 text-xs leading-5 text-default"
              data-test="subagent-prompt"
              >{{ prompt }}</pre>
            <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">Prompt 未提供</p>
          </section>

          <section aria-labelledby="subagent-tools-title" class="space-y-3">
            <h3 id="subagent-tools-title" class="text-sm font-semibold text-highlighted">
              工具活动
            </h3>

            <div v-if="call.descendants.length > 0" class="space-y-2" data-test="subagent-tools">
              <div
                v-for="entry in call.descendants"
                :key="`${entry.partIndex}-${entry.part.toolCallId}`"
                :class="depthClass(entry.depth)"
                :data-depth="entry.depth"
                data-test="subagent-tool-entry"
              >
                <details class="rounded-lg border border-default/50 bg-elevated">
                  <summary
                    class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <UIcon :name="getToolIcon(entry.part)" class="size-4 shrink-0 text-muted" />
                    <span class="min-w-0 flex-1 truncate text-default">
                      {{ getToolText(entry.part) }}
                    </span>
                    <span v-if="getToolSuffix(entry.part)" class="truncate text-xs text-muted">
                      {{ getToolSuffix(entry.part) }}
                    </span>
                    <span class="text-xs text-muted">
                      {{ isToolStreaming(entry.part) ? "运行中" : "查看详情" }}
                    </span>
                  </summary>
                  <div class="max-h-72 space-y-3 overflow-auto border-t border-default/50 p-3">
                    <div v-if="toolInput(entry.part)" class="space-y-1">
                      <p class="text-xs font-medium text-muted">Input</p>
                      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-default">{{
                        toolInput(entry.part)
                      }}</pre>
                    </div>
                    <div v-if="getToolOutput(entry.part)" class="space-y-1">
                      <p class="text-xs font-medium text-muted">Output</p>
                      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-default">{{
                        getToolOutput(entry.part)
                      }}</pre>
                    </div>
                  </div>
                </details>
              </div>
            </div>

            <div
              v-else-if="!isSettledState"
              class="flex items-center gap-2 rounded-lg bg-elevated p-3 text-sm text-muted"
              data-test="subagent-tools-waiting"
            >
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              <span>等待子 Agent 工具调用…</span>
            </div>
            <AppEmptyState
              v-else
              compact
              icon="i-lucide-wrench"
              title="未记录工具调用"
              description="该子 Agent 没有返回可关联的工具活动。"
              data-test="subagent-tools-empty"
            />
          </section>

          <section aria-labelledby="subagent-result-title" class="space-y-3">
            <h3 id="subagent-result-title" class="text-sm font-semibold text-highlighted">
              最终回复
            </h3>
            <MarkStream
              v-if="result"
              :id="`${props.message.id}-${props.rootToolCallId}-result`"
              :content="result"
              :is-streaming="false"
              :is-dark="props.isDark"
              data-test="subagent-result"
            />
            <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">
              {{ isSettledState ? "未提供最终回复" : "正在等待子 Agent 回复…" }}
            </p>
          </section>
        </div>

        <div v-else class="flex min-h-0 flex-1 items-center justify-center px-5 py-4">
          <AppEmptyState
            compact
            icon="i-lucide-unplug"
            title="调用数据不可用"
            description="该调用关系已发生变化，请关闭详情后重试。"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
