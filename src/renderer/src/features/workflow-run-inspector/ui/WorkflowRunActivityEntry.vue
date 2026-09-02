<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { semanticIcons } from "@renderer/config/semantic-icons";
import { useWorkflowRunStore } from "@renderer/stores";
import {
  useWorkflowRunInspector,
  useWorkflowRunListInterest,
} from "../application/use-workflow-run-inspector";
import {
  sortWorkflowRunSummaries,
  workflowRunActivityStats,
  workflowRunStatusPresentation,
} from "../model/projection";
import WorkflowRunDetailSlideover from "./WorkflowRunDetailSlideover.vue";

const props = defineProps<{ workspaceId: string; parentSessionId: string; isDark?: boolean }>();
const store = useWorkflowRunStore();
const selectedRunId = ref<string | null>(null);
const lastTrigger = ref<HTMLButtonElement | null>(null);
const owner = computed(() => ({
  workspaceId: props.workspaceId,
  parentSessionId: props.parentSessionId,
}));
const entries = computed(() =>
  sortWorkflowRunSummaries(store.listState(props.workspaceId, props.parentSessionId).runs)
);
const stats = computed(() => workflowRunActivityStats(entries.value));
const inspector = useWorkflowRunInspector({
  workspaceId: () => props.workspaceId,
  parentSessionId: () => props.parentSessionId,
  runId: () => selectedRunId.value ?? "",
});

useWorkflowRunListInterest(owner);

function openDetail(runId: string, event: MouseEvent): void {
  lastTrigger.value = event.currentTarget as HTMLButtonElement;
  selectedRunId.value = runId;
  void inspector.openDetail();
}

function decide(decision: "approve" | "reject"): void {
  void inspector.decide(decision).catch(() => undefined);
}

watch(
  () => [props.workspaceId, props.parentSessionId] as const,
  () => {
    selectedRunId.value = null;
    inspector.closeDetail();
  }
);
watch(inspector.open, async (open, previous) => {
  if (!open && previous) {
    await nextTick();
    lastTrigger.value?.focus();
  }
});
onBeforeUnmount(() => inspector.closeDetail());
</script>

<template>
  <UPopover
    v-if="entries.length > 0"
    :content="{ align: 'start', side: 'top', sideOffset: 6 }"
    :ui="{ content: 'w-[min(26rem,calc(100vw-2rem))] p-2' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="semanticIcons.workflow"
      aria-label="查看 Workflow Run 活动"
      data-test="workflow-run-activity-trigger"
    >
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="shrink-0">Workflow {{ stats.total }}</span>
        <span v-if="stats.active > 0" class="truncate text-primary"
          >{{ stats.active }} 正在运行</span
        >
        <span v-if="stats.awaiting > 0" class="truncate text-warning"
          >{{ stats.awaiting }} 等待处理</span
        >
      </span>
    </UButton>
    <template #content>
      <div
        class="flex max-h-80 flex-col gap-1 overflow-auto"
        data-test="workflow-run-activity-list"
      >
        <button
          v-for="entry in entries"
          :key="entry.runId"
          type="button"
          class="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="'打开 ' + entry.workflowName + ' Workflow Run 详情'"
          @click="openDetail(entry.runId, $event)"
        >
          <div class="flex items-center justify-between gap-2">
            <span
              class="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-highlighted"
            >
              <UIcon
                :name="workflowRunStatusPresentation(entry.status).icon"
                class="size-3.5 shrink-0"
                :class="{ 'animate-spin': entry.status === 'running' }"
              />
              <span class="truncate">{{ entry.workflowName }}</span>
            </span>
            <span class="shrink-0 text-xs text-muted">
              {{ workflowRunStatusPresentation(entry.status).label }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-muted">Stage · {{ entry.currentStageId }}</p>
          <p v-if="entry.pendingDecision" class="mt-1 truncate text-xs text-warning">
            {{ entry.pendingDecision.prompt }}
          </p>
          <time class="mt-1 block text-xs text-dimmed">{{
            new Date(entry.updatedAt).toLocaleString("zh-CN")
          }}</time>
        </button>
      </div>
    </template>
  </UPopover>
  <WorkflowRunDetailSlideover
    :open="inspector.open.value"
    :loading="inspector.state.value.loading"
    :error="inspector.state.value.error"
    :result="inspector.detail.value"
    :is-dark="props.isDark"
    @update:open="inspector.open.value = $event"
    @decide="decide"
  />
</template>
