<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
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
const inspector = useSpawnedSessionInspector({
  workspaceId: () => props.workspaceId,
  parentSessionId: () => props.parentSessionId,
  sessionId: () => props.sessionId,
});
const presentation = computed(() =>
  inspector.detail.value
    ? spawnedSessionStatusPresentation(inspector.detail.value.summary.status)
    : null
);
const label = computed(() => {
  if (inspector.state.value.error) return "Session 查询失败";
  if (inspector.state.value.result?.status === "not_found") return "Session 信息不可用";
  if (!inspector.detail.value) return "正在加载子 Agent Session…";
  return `${inspector.detail.value.summary.agent.name} · ${presentation.value?.label}`;
});

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
    class="my-1 inline-flex max-w-full items-center gap-2 rounded-lg border border-default bg-elevated px-2.5 py-1.5 text-left text-xs text-highlighted transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-70"
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
          !presentation ||
          inspector.detail.value?.summary.status === 'starting' ||
          inspector.detail.value?.summary.status === 'running',
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
