<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useSpawnedSessionStore } from "@renderer/stores";
import { spawnedSessionStatusPresentation } from "../model/projection";
import SpawnedSessionDetailSlideover from "./SpawnedSessionDetailSlideover.vue";

const props = defineProps<{ workspaceId: string; parentSessionId: string; isDark?: boolean }>();
const store = useSpawnedSessionStore();
const selectedSessionId = ref<string | null>(null);
const detailOpen = ref(false);
const lastTrigger = ref<HTMLButtonElement | null>(null);
const entries = computed(() =>
  store.activeBackgroundForParent(props.workspaceId, props.parentSessionId)
);
const selectedState = computed(() =>
  selectedSessionId.value
    ? store.detailState(props.workspaceId, props.parentSessionId, selectedSessionId.value)
    : { result: null, loading: false, error: null }
);

function refresh(): void {
  void store.loadParentSessions({
    workspaceId: props.workspaceId,
    parentSessionId: props.parentSessionId,
  });
}

function openDetail(sessionId: string, event: MouseEvent): void {
  lastTrigger.value = event.currentTarget as HTMLButtonElement;
  selectedSessionId.value = sessionId;
  detailOpen.value = true;
  void store.loadDetail({
    workspaceId: props.workspaceId,
    parentSessionId: props.parentSessionId,
    sessionId,
  });
}

watch(
  () => [props.workspaceId, props.parentSessionId] as const,
  () => {
    selectedSessionId.value = null;
    detailOpen.value = false;
    refresh();
  }
);
watch(detailOpen, async (open, previous) => {
  if (!open && previous) {
    await nextTick();
    lastTrigger.value?.focus();
  }
});
onMounted(refresh);
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
      icon="i-lucide-loader-circle"
      :aria-label="`正在运行 ${entries.length} 个后台任务`"
      data-test="spawned-background-trigger"
    >
      <span class="flex items-center gap-1.5"
        ><UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />正在运行
        {{ entries.length }} 个后台任务</span
      >
    </UButton>
    <template #content>
      <div class="flex max-h-72 flex-col gap-1 overflow-auto" data-test="spawned-background-list">
        <button
          v-for="entry in entries"
          :key="entry.sessionId"
          type="button"
          class="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
          @click="openDetail(entry.sessionId, $event)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-sm font-medium text-highlighted">{{ entry.agent.name }}</span
            ><span class="shrink-0 text-xs text-muted">{{
              spawnedSessionStatusPresentation(entry.status).label
            }}</span>
          </div>
          <p class="mt-1 truncate text-xs text-muted">
            {{ entry.promptPreview || "Prompt 未记录" }}
          </p>
          <time v-if="entry.startedAt" class="mt-1 block text-xs text-dimmed">{{
            new Date(entry.startedAt).toLocaleString("zh-CN")
          }}</time>
        </button>
      </div>
    </template>
  </UPopover>
  <SpawnedSessionDetailSlideover
    :open="detailOpen"
    :loading="selectedState.loading"
    :error="selectedState.error"
    :result="selectedState.result"
    :is-dark="props.isDark"
    @update:open="detailOpen = $event"
  />
</template>
