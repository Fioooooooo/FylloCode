<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSpawnedSessionStore } from "@renderer/stores";
import { useSpawnedSessionInspector } from "../application/use-spawned-session-inspector";
import { spawnedSessionStatusPresentation } from "../model/projection";
import SpawnedSessionDetailSlideover from "./SpawnedSessionDetailSlideover.vue";

const props = defineProps<{
  workspaceId: string;
  parentSessionId: string;
  sessionId: string;
  isDark?: boolean;
}>();

const trigger = ref<HTMLButtonElement | null>(null);
const store = useSpawnedSessionStore();
const inspector = useSpawnedSessionInspector({
  workspaceId: () => props.workspaceId,
  parentSessionId: () => props.parentSessionId,
  sessionId: () => props.sessionId,
});
const listState = computed(() => store.listState(props.workspaceId, props.parentSessionId));
const summary = computed(() =>
  listState.value.items.find((item) => item.sessionId === props.sessionId)
);
const presentation = computed(() =>
  summary.value ? spawnedSessionStatusPresentation(summary.value.status) : null
);
const label = computed(() => {
  if (inspector.state.value.result?.status === "not_found") return "Session 信息不可用";
  if (listState.value.error) return "Session 查询失败";
  if (!summary.value) return "正在加载子 Agent Session…";
  return `${summary.value.agent.name} · ${presentation.value?.label}`;
});

let releaseListInterest: (() => void) | null = null;
function resetListInterest(): void {
  releaseListInterest?.();
  releaseListInterest = store.acquireParentListInterest({
    workspaceId: props.workspaceId,
    parentSessionId: props.parentSessionId,
  });
}

onMounted(resetListInterest);
onBeforeUnmount(() => releaseListInterest?.());
watch(() => [props.workspaceId, props.parentSessionId] as const, resetListInterest);

watch(inspector.open, async (open, previous) => {
  if (!open && previous) {
    await nextTick();
    trigger.value?.focus();
  }
});
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="my-4 inline-flex max-w-full items-center gap-2 rounded-lg border border-default bg-elevated px-2.5 py-1.5 text-left text-xs text-highlighted transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-70"
    :disabled="inspector.state.value.result?.status === 'not_found'"
    :aria-label="`打开${label}详情`"
    :aria-expanded="inspector.open.value"
    data-fyllo-signal-spawn-session
    @click="inspector.openDetail"
  >
    <UIcon
      :name="presentation?.icon ?? 'i-lucide-loader-circle'"
      class="size-3.5 shrink-0"
      :class="{
        'animate-spin':
          !presentation || summary?.status === 'starting' || summary?.status === 'running',
      }"
    />
    <span class="truncate">{{ label }}</span>
  </button>
  <SpawnedSessionDetailSlideover
    :open="inspector.open.value"
    :loading="inspector.state.value.loading"
    :error="inspector.state.value.error"
    :result="inspector.state.value.result"
    :is-dark="props.isDark"
    @update:open="inspector.open.value = $event"
  />
</template>
