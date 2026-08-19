<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { semanticIcons } from "@renderer/config/semantic-icons";
import { useSpawnedSessionStore } from "@renderer/stores";
import { useSpawnedSessionInspector } from "../application/use-spawned-session-inspector";
import {
  spawnedSessionActivityStats,
  spawnedSessionStatusPresentation,
  sortSpawnedSessionSummaries,
} from "../model/projection";
import SpawnedSessionDetailSlideover from "./SpawnedSessionDetailSlideover.vue";

const props = defineProps<{ workspaceId: string; parentSessionId: string; isDark?: boolean }>();
const store = useSpawnedSessionStore();
const selectedSessionId = ref<string | null>(null);
const lastTrigger = ref<HTMLButtonElement | null>(null);
const entries = computed(() =>
  sortSpawnedSessionSummaries(store.listState(props.workspaceId, props.parentSessionId).items)
);
const stats = computed(() => spawnedSessionActivityStats(entries.value));
const inspector = useSpawnedSessionInspector({
  workspaceId: () => props.workspaceId,
  parentSessionId: () => props.parentSessionId,
  sessionId: () => selectedSessionId.value ?? "",
});

let releaseListInterest: (() => void) | null = null;
function resetListInterest(): void {
  releaseListInterest?.();
  releaseListInterest = store.acquireParentListInterest({
    workspaceId: props.workspaceId,
    parentSessionId: props.parentSessionId,
  });
}

function openDetail(sessionId: string, event: MouseEvent): void {
  lastTrigger.value = event.currentTarget as HTMLButtonElement;
  selectedSessionId.value = sessionId;
  void inspector.openDetail();
}

watch(
  () => [props.workspaceId, props.parentSessionId] as const,
  () => {
    selectedSessionId.value = null;
    inspector.closeDetail();
    resetListInterest();
  }
);
watch(inspector.open, async (open, previous) => {
  if (!open && previous) {
    await nextTick();
    lastTrigger.value?.focus();
  }
});
onMounted(resetListInterest);
onBeforeUnmount(() => releaseListInterest?.());
</script>

<template>
  <UPopover
    v-if="entries.length > 0"
    :content="{ align: 'start', side: 'top', sideOffset: 6 }"
    :ui="{ content: 'w-[min(22rem,calc(100vw-2rem))] p-2' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="semanticIcons.subagent"
      aria-label="查看后台子 Agent 活动"
      data-test="spawned-activity-trigger"
    >
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="shrink-0">子 Agent {{ stats.total }}</span>
        <span v-if="stats.active > 0" class="truncate text-primary"
          >{{ stats.active }} 正在运行</span
        >
      </span>
    </UButton>
    <template #content>
      <div class="flex max-h-72 flex-col gap-1 overflow-auto" data-test="spawned-activity-list">
        <button
          v-for="entry in entries"
          :key="entry.sessionId"
          type="button"
          class="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="'打开 ' + entry.agent.name + ' 子 Agent Session 详情'"
          @click="openDetail(entry.sessionId, $event)"
        >
          <div class="flex items-center justify-between gap-2">
            <span
              class="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-highlighted"
            >
              <UIcon
                :name="spawnedSessionStatusPresentation(entry.status).icon"
                class="size-3.5 shrink-0"
                :class="{
                  'animate-spin': entry.status === 'starting' || entry.status === 'running',
                }"
              />
              <span class="truncate">{{ entry.agent.name }}</span>
            </span>
            <span class="shrink-0 text-xs text-muted">
              {{
                entry.mode === "sync" ? "同步" : entry.mode === "background" ? "后台" : "模式未知"
              }}
              · {{ spawnedSessionStatusPresentation(entry.status).label }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-muted">
            {{ entry.promptPreview || "Prompt 未记录" }}
          </p>
          <time class="mt-1 block text-xs text-dimmed">{{
            new Date(entry.updatedAt).toLocaleString("zh-CN")
          }}</time>
        </button>
      </div>
    </template>
  </UPopover>
  <SpawnedSessionDetailSlideover
    :open="inspector.open.value"
    :loading="inspector.state.value.loading"
    :error="inspector.state.value.error"
    :result="inspector.state.value.result"
    :is-dark="props.isDark"
    @update:open="inspector.open.value = $event"
  />
</template>
