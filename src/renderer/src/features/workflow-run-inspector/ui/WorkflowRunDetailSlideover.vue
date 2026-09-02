<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { WorkflowRunDetail, WorkflowRunDecisionRequest } from "@shared/types/workflow";
import { semanticIcons } from "@renderer/config/semantic-icons";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import { projectWorkflowRunDetail, workflowRunStatusPresentation } from "../model/projection";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string | null;
  result: WorkflowRunDetail | null;
  isDark?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  decide: [decision: WorkflowRunDecisionRequest["decision"]];
}>();

const projection = computed(() => (props.result ? projectWorkflowRunDetail(props.result) : null));
const presentation = computed(() =>
  props.result ? workflowRunStatusPresentation(props.result.status) : null
);
const isPendingDecision = computed(() => props.result?.pendingDecision !== undefined);
const transcriptSection = ref<HTMLElement | null>(null);

async function openTranscript(): Promise<void> {
  await nextTick();
  transcriptSection.value?.focus();
}

function formatTime(value?: string): string {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}
</script>

<template>
  <USlideover
    :open="props.open"
    :close="false"
    :ui="{ content: 'w-[min(100vw,760px)] max-w-none', body: 'h-full min-h-0 p-0 sm:p-0' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        class="flex h-full min-h-0 flex-col overflow-hidden bg-default"
        data-test="workflow-run-slideover"
      >
        <header class="shrink-0 border-b border-default px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-base font-semibold text-highlighted">
                  {{ props.result?.workflowName || "Workflow Run" }}
                </h2>
                <UBadge v-if="presentation" :color="presentation.color" variant="soft" size="xs">
                  <UIcon
                    :name="presentation.icon"
                    class="mr-1 size-3.5"
                    :class="{ 'animate-spin': props.result?.status === 'running' }"
                  />
                  {{ presentation.label }}
                </UBadge>
              </div>
              <p v-if="props.result" class="text-xs text-muted">
                {{ props.result.workflowId }} · Run {{ props.result.runId }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="关闭 Workflow Run 详情"
              @click="emit('update:open', false)"
            />
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div
            v-if="props.loading && !props.result"
            class="flex items-center gap-2 py-8 text-sm text-muted"
            role="status"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            正在加载 Workflow Run…
          </div>
          <AppEmptyState
            v-else-if="props.error && !props.result"
            compact
            icon="i-lucide-circle-alert"
            title="无法加载 Workflow Run"
            :description="props.error"
          />
          <div v-else-if="props.result && projection" class="space-y-6">
            <section aria-labelledby="workflow-run-status-title" class="space-y-3">
              <h3 id="workflow-run-status-title" class="text-sm font-semibold text-highlighted">
                Run 状态
              </h3>
              <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">当前 Stage</dt>
                  <dd class="mt-1 break-all font-mono text-default">
                    {{ projection.currentStageId }}
                  </dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">创建时间</dt>
                  <dd class="mt-1 text-default">{{ formatTime(props.result.createdAt) }}</dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">最近更新</dt>
                  <dd class="mt-1 text-default">{{ formatTime(props.result.updatedAt) }}</dd>
                </div>
              </dl>
            </section>

            <section
              v-if="isPendingDecision"
              aria-labelledby="workflow-run-decision-title"
              class="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4"
              data-test="workflow-run-decision"
            >
              <h3 id="workflow-run-decision-title" class="text-sm font-semibold text-highlighted">
                需要你的决定
              </h3>
              <p class="text-sm leading-6 text-default">
                {{ props.result.pendingDecision?.prompt }}
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  color="primary"
                  size="sm"
                  :loading="props.loading"
                  data-test="workflow-run-approve"
                  @click="emit('decide', 'approve')"
                >
                  批准
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :loading="props.loading"
                  data-test="workflow-run-reject"
                  @click="emit('decide', 'reject')"
                >
                  拒绝
                </UButton>
              </div>
            </section>

            <section
              v-if="projection.error || props.error"
              aria-labelledby="workflow-run-error-title"
              class="space-y-2"
            >
              <h3 id="workflow-run-error-title" class="text-sm font-semibold text-highlighted">
                错误
              </h3>
              <div
                class="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
                role="alert"
              >
                <p class="font-mono text-xs">{{ projection.error?.code ?? "QUERY_FAILED" }}</p>
                <p class="mt-1">{{ projection.error?.message ?? props.error }}</p>
              </div>
            </section>

            <section aria-labelledby="workflow-run-artifact-title" class="space-y-3">
              <h3 id="workflow-run-artifact-title" class="text-sm font-semibold text-highlighted">
                Artifacts
              </h3>
              <div v-if="projection.artifactCount > 0" class="flex flex-wrap gap-2">
                <UBadge
                  v-for="artifactId in projection.artifactIds"
                  :key="artifactId"
                  variant="soft"
                >
                  {{ artifactId }}
                </UBadge>
              </div>
              <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">暂无 Artifact</p>
            </section>

            <section
              v-if="projection.hasFreshSession"
              aria-labelledby="workflow-run-session-title"
              class="space-y-3"
            >
              <h3 id="workflow-run-session-title" class="text-sm font-semibold text-highlighted">
                Workflow Agent Session
              </h3>
              <p class="break-all rounded-lg bg-elevated p-3 font-mono text-xs text-muted">
                {{ props.result.agentSessionState?.sessionId }}
              </p>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                :data-session-id="props.result.agentSessionState?.sessionId"
                data-test="workflow-run-open-transcript"
                :aria-label="`查看 Workflow Agent Session ${props.result.agentSessionState?.sessionId} 的 Transcript`"
                @click="openTranscript"
              >
                查看该 Agent 的 Transcript
              </UButton>
            </section>

            <section
              ref="transcriptSection"
              tabindex="-1"
              aria-labelledby="workflow-run-transcript-title"
              class="space-y-3 outline-none"
            >
              <h3 id="workflow-run-transcript-title" class="text-sm font-semibold text-highlighted">
                Transcript
              </h3>
              <pre
                v-if="projection.transcript"
                class="whitespace-pre-wrap wrap-anywhere rounded-lg bg-elevated p-3 text-sm leading-6 text-default"
                >{{ projection.transcript }}</pre>
              <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">暂无 Transcript</p>
            </section>
          </div>
          <AppEmptyState
            v-else
            compact
            :icon="semanticIcons.workflow"
            title="Run 信息不可用"
            description="该 Workflow Run 不存在或暂时无法读取。"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
