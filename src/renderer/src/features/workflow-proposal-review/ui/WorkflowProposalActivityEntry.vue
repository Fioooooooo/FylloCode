<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { semanticIcons } from "@renderer/config/semantic-icons";
import { useWorkflowProposalStore } from "@renderer/stores";
import {
  useWorkflowProposalListInterest,
  useWorkflowProposalReview,
} from "../application/use-workflow-proposal-review";
import {
  sortWorkflowProposalSummaries,
  workflowProposalActivityStats,
  workflowProposalStatusPresentation,
} from "../model/projection";
import WorkflowProposalConfirmCard from "./WorkflowProposalConfirmCard.vue";

const props = defineProps<{ workspaceId: string; parentSessionId: string; isDark?: boolean }>();
const store = useWorkflowProposalStore();
const selectedProposalId = ref<string | null>(null);
const lastTrigger = ref<HTMLButtonElement | null>(null);
const owner = computed(() => ({
  workspaceId: props.workspaceId,
  parentSessionId: props.parentSessionId,
}));
const entries = computed(() =>
  sortWorkflowProposalSummaries(store.listState(props.workspaceId, props.parentSessionId).proposals)
);
const stats = computed(() => workflowProposalActivityStats(entries.value));
const inspector = useWorkflowProposalReview({
  workspaceId: () => props.workspaceId,
  parentSessionId: () => props.parentSessionId,
  proposalId: () => selectedProposalId.value ?? "",
});

useWorkflowProposalListInterest(owner);

function openDetail(proposalId: string, event: MouseEvent): void {
  lastTrigger.value = event.currentTarget as HTMLButtonElement;
  selectedProposalId.value = proposalId;
  void inspector.openDetail();
}

function confirm(persist: "session" | "workspace"): void {
  void inspector.confirm(persist).catch(() => undefined);
}

function cancel(): void {
  void inspector.cancel().catch(() => undefined);
}

watch(
  () => [props.workspaceId, props.parentSessionId] as const,
  () => {
    selectedProposalId.value = null;
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
    :ui="{ content: 'w-[min(28rem,calc(100vw-2rem))] p-2' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="semanticIcons.workflow"
      aria-label="查看 Workflow 提案活动"
      data-test="workflow-proposal-activity-trigger"
    >
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="shrink-0">Workflow 提案 {{ stats.total }}</span>
        <span v-if="stats.pending > 0" class="truncate text-warning"
          >{{ stats.pending }} 待确认</span
        >
      </span>
    </UButton>
    <template #content>
      <div
        class="flex max-h-80 flex-col gap-1 overflow-auto"
        data-test="workflow-proposal-activity-list"
      >
        <button
          v-for="entry in entries"
          :key="entry.proposalId"
          type="button"
          class="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="'打开 ' + entry.proposalId + ' Workflow 提案详情'"
          @click="openDetail(entry.proposalId, $event)"
        >
          <div class="flex items-center justify-between gap-2">
            <span
              class="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-highlighted"
            >
              <UIcon
                :name="workflowProposalStatusPresentation(entry.status).icon"
                class="size-3.5 shrink-0"
                :class="{ 'animate-spin': entry.status === 'confirming' }"
              />
              <span class="truncate">{{ entry.proposalId }}</span>
            </span>
            <span class="shrink-0 text-xs text-muted">
              {{ workflowProposalStatusPresentation(entry.status).label }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-muted">
            {{ entry.mode === "update" ? `更新 ${entry.targetWorkflowId}` : "新建 Workflow" }}
          </p>
          <time class="mt-1 block text-xs text-dimmed">{{
            new Date(entry.updatedAt).toLocaleString("zh-CN")
          }}</time>
        </button>
      </div>
    </template>
  </UPopover>
  <USlideover
    :open="inspector.open.value"
    :close="false"
    :ui="{ content: 'w-[min(100vw,860px)] max-w-none', body: 'h-full min-h-0 p-0 sm:p-0' }"
    @update:open="inspector.open.value = $event"
  >
    <template #body>
      <WorkflowProposalConfirmCard
        :detail="inspector.detail.value"
        :loading="inspector.state.value.loading"
        :error="inspector.state.value.error"
        @confirm="confirm"
        @cancel="cancel"
      />
    </template>
  </USlideover>
</template>
