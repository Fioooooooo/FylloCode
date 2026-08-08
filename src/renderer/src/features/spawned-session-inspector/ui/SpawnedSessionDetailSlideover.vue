<script setup lang="ts">
import { computed } from "vue";
import type { SpawnedSessionDetailResult } from "@shared/ipc/session/spawned-session.schemas";
import type { AssistantActivityEntry } from "@renderer/utils/chatAssistant";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import ChatActivityGroup from "@renderer/components/chat/message/ChatActivityGroup.vue";
import {
  projectSpawnedSessionContent,
  spawnedSessionStatusPresentation,
} from "../model/projection";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string | null;
  result: SpawnedSessionDetailResult | null;
  isDark?: boolean;
}>();

const emit = defineEmits<{ "update:open": [value: boolean] }>();
const detail = computed(() => (props.result?.status === "ready" ? props.result : null));
const presentation = computed(() =>
  detail.value ? spawnedSessionStatusPresentation(detail.value.summary.status) : null
);
const content = computed(() =>
  detail.value
    ? projectSpawnedSessionContent(detail.value.messages)
    : { activities: [], transcript: [] }
);
const activities = computed(() => content.value.activities as unknown as AssistantActivityEntry[]);
const responseIds = computed(() =>
  detail.value
    ? [...new Set(detail.value.turns.flatMap((turn) => (turn.responseId ? [turn.responseId] : [])))]
    : []
);

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
        data-test="spawned-session-slideover"
      >
        <header class="shrink-0 border-b border-default px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-base font-semibold text-highlighted">
                  {{ detail?.summary.promptPreview || "子 Agent Session" }}
                </h2>
                <UBadge v-if="presentation" :color="presentation.color" variant="soft" size="xs">
                  <UIcon
                    :name="presentation.icon"
                    class="mr-1 size-3.5"
                    :class="{
                      'animate-spin':
                        detail?.summary.status === 'starting' ||
                        detail?.summary.status === 'running',
                    }"
                  />
                  {{ presentation.label }}
                </UBadge>
              </div>
              <p v-if="detail" class="text-xs text-muted">
                {{ detail.summary.agent.name }} · {{ detail.summary.agent.agentId }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="关闭子 Agent Session 详情"
              @click="emit('update:open', false)"
            />
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div
            v-if="props.loading && !detail"
            class="flex items-center gap-2 py-8 text-sm text-muted"
            role="status"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            正在加载子 Agent Session…
          </div>
          <AppEmptyState
            v-else-if="props.error"
            compact
            icon="i-lucide-circle-alert"
            title="无法加载子 Agent Session"
            :description="props.error"
          />
          <AppEmptyState
            v-else-if="props.result?.status === 'not_found'"
            compact
            icon="i-lucide-unplug"
            title="Session 信息不可用"
            description="该子 Agent Session 不存在、已删除或不属于当前对话。"
          />

          <div v-else-if="detail" class="space-y-6">
            <section aria-labelledby="spawned-session-summary-title" class="space-y-3">
              <h3 id="spawned-session-summary-title" class="text-sm font-semibold text-highlighted">
                运行信息
              </h3>
              <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">开始时间</dt>
                  <dd class="mt-1 text-default">{{ formatTime(detail.summary.startedAt) }}</dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">最近活动</dt>
                  <dd class="mt-1 text-default">{{ formatTime(detail.summary.lastActivityAt) }}</dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">更新时间</dt>
                  <dd class="mt-1 text-default">{{ formatTime(detail.summary.updatedAt) }}</dd>
                </div>
              </dl>
              <div
                v-if="detail.summary.error"
                class="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
                role="alert"
              >
                <p class="font-mono text-xs">{{ detail.summary.error.code }}</p>
                <p class="mt-1">{{ detail.summary.error.message }}</p>
              </div>
            </section>

            <section aria-labelledby="spawned-session-prompt-title" class="space-y-3">
              <h3 id="spawned-session-prompt-title" class="text-sm font-semibold text-highlighted">
                原始委派 Prompt
              </h3>
              <pre
                v-if="detail.initialPrompt"
                class="whitespace-pre-wrap wrap-anywhere rounded-lg bg-elevated p-3 text-sm leading-6 text-default"
                >{{ detail.initialPrompt.text }}</pre>
              <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">未记录原始 Prompt</p>
            </section>

            <section aria-labelledby="spawned-session-activity-title" class="space-y-3">
              <h3
                id="spawned-session-activity-title"
                class="text-sm font-semibold text-highlighted"
              >
                Activity
              </h3>
              <ChatActivityGroup v-if="activities.length > 0" :activities="activities" />
              <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">未记录 Activity</p>
            </section>

            <section aria-labelledby="spawned-session-transcript-title" class="space-y-3">
              <h3
                id="spawned-session-transcript-title"
                class="text-sm font-semibold text-highlighted"
              >
                Transcript
              </h3>
              <div v-if="content.transcript.length > 0" class="space-y-4">
                <MarkStream
                  v-for="entry in content.transcript"
                  :id="entry.id"
                  :key="entry.id"
                  :content="entry.text"
                  :is-streaming="false"
                  :is-dark="Boolean(props.isDark)"
                  :enable-actions="false"
                  :enable-signals="false"
                />
              </div>
              <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">
                {{
                  detail.summary.status === "starting" || detail.summary.status === "running"
                    ? "正在等待子 Agent 输出…"
                    : "未记录文本输出"
                }}
              </p>
            </section>

            <section
              v-if="responseIds.length > 0"
              aria-labelledby="spawned-session-response-title"
              class="space-y-2"
            >
              <h3
                id="spawned-session-response-title"
                class="text-sm font-semibold text-highlighted"
              >
                Response 引用
              </h3>
              <code
                v-for="responseId in responseIds"
                :key="responseId"
                class="block wrap-anywhere rounded bg-elevated px-2 py-1 text-xs text-muted"
                >{{ responseId }}</code
              >
            </section>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
