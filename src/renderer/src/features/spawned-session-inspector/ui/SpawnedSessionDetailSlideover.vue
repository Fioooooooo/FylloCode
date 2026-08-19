<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
const selectedTurnId = ref<string>();
const followsLatestTurn = ref(true);
const turnIdentity = computed(
  () => detail.value?.turns.map((turn) => turn.turnId).join("\0") ?? ""
);
const latestTurn = computed(() => detail.value?.turns.at(-1));
const turnOptions = computed(
  () =>
    detail.value?.turns.map((turn) => ({
      label: `第 ${turn.ordinal} 轮 / 共 ${detail.value?.turns.length ?? 0} 轮 · ${spawnedSessionStatusPresentation(turn.status).label}`,
      value: turn.turnId,
    })) ?? []
);
const selectedTurn = computed(() => {
  if (!detail.value) return undefined;
  return (
    detail.value.turns.find((turn) => turn.turnId === selectedTurnId.value) ?? latestTurn.value
  );
});
const presentation = computed(() => {
  const status = selectedTurn.value?.status ?? detail.value?.summary.status;
  return status ? spawnedSessionStatusPresentation(status) : null;
});
const content = computed(() =>
  selectedTurn.value
    ? projectSpawnedSessionContent(selectedTurn.value.messages)
    : { activities: [], transcript: [] }
);
const activities = computed(() => content.value.activities as unknown as AssistantActivityEntry[]);
const responseId = computed(() => selectedTurn.value?.responseId);
const latestTurnHasActivity = computed(() =>
  Boolean(
    selectedTurn.value &&
    latestTurn.value &&
    selectedTurn.value.turnId !== latestTurn.value.turnId &&
    (latestTurn.value.status === "starting" || latestTurn.value.status === "running")
  )
);

watch(
  [() => detail.value?.summary.sessionId, turnIdentity],
  () => {
    const latestId = latestTurn.value?.turnId;
    if (
      followsLatestTurn.value ||
      !detail.value?.turns.some((turn) => turn.turnId === selectedTurnId.value)
    ) {
      selectedTurnId.value = latestId;
      followsLatestTurn.value = true;
    }
  },
  { immediate: true }
);

watch(selectedTurnId, (value) => {
  followsLatestTurn.value = value === latestTurn.value?.turnId;
});

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
                        selectedTurn?.status === 'starting' || selectedTurn?.status === 'running',
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
          <AppEmptyState
            v-else-if="detail && detail.turns.length === 0"
            compact
            icon="i-lucide-history"
            title="暂无 Turn 记录"
            description="该子 Agent Session 尚未留下可查看的 Turn。"
          />

          <div v-else-if="detail && selectedTurn" class="space-y-6">
            <section aria-labelledby="spawned-session-turn-title" class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h3 id="spawned-session-turn-title" class="text-sm font-semibold text-highlighted">
                  当前 Turn
                </h3>
                <div class="flex items-center gap-2 text-xs text-muted">
                  <span>查看</span>
                  <USelect
                    v-model="selectedTurnId"
                    :items="turnOptions"
                    value-key="value"
                    label-key="label"
                    size="sm"
                    class="min-w-40"
                    :ui="{ content: 'z-[60]' }"
                    aria-label="选择子 Agent Turn"
                  />
                </div>
              </div>
              <p v-if="latestTurnHasActivity" class="text-xs text-primary" role="status">
                最新一轮正在活动，当前仍保持第 {{ selectedTurn.ordinal }} 轮。
              </p>
              <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">状态</dt>
                  <dd class="mt-1 text-default">
                    {{ presentation?.label ?? "未记录" }}
                  </dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">开始时间</dt>
                  <dd class="mt-1 text-default">{{ formatTime(selectedTurn.startedAt) }}</dd>
                </div>
                <div class="rounded-lg bg-elevated p-3">
                  <dt class="text-xs text-muted">最近活动</dt>
                  <dd class="mt-1 text-default">{{ formatTime(selectedTurn.lastActivityAt) }}</dd>
                </div>
              </dl>
              <div
                v-if="selectedTurn.error"
                class="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
                role="alert"
              >
                <p class="font-mono text-xs">{{ selectedTurn.error.code }}</p>
                <p class="mt-1">{{ selectedTurn.error.message }}</p>
              </div>
            </section>

            <section aria-labelledby="spawned-session-prompt-title" class="space-y-3">
              <h3 id="spawned-session-prompt-title" class="text-sm font-semibold text-highlighted">
                本轮 Prompt
              </h3>
              <pre
                v-if="selectedTurn.prompt"
                class="whitespace-pre-wrap wrap-anywhere rounded-lg bg-elevated p-3 text-sm leading-6 text-default"
                >{{ selectedTurn.prompt.text }}</pre>
              <p v-else class="rounded-lg bg-elevated p-3 text-sm text-muted">未记录本轮 Prompt</p>
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
                  selectedTurn.status === "starting" || selectedTurn.status === "running"
                    ? "正在等待子 Agent 输出…"
                    : "未记录文本输出"
                }}
              </p>
            </section>

            <section
              v-if="responseId"
              aria-labelledby="spawned-session-response-title"
              class="space-y-2"
            >
              <h3
                id="spawned-session-response-title"
                class="text-sm font-semibold text-highlighted"
              >
                Response 引用
              </h3>
              <code class="block wrap-anywhere rounded bg-elevated px-2 py-1 text-xs text-muted">{{
                responseId
              }}</code>
            </section>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
