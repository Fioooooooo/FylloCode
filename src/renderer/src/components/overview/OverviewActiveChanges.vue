<script setup lang="ts">
import { timeAgo } from "@renderer/utils/time";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import { proposalDisplayStatusConfig } from "@renderer/utils/proposal-display-status";
import type { ActiveChange } from "@renderer/stores/overview";

const props = defineProps<{
  changes: ActiveChange[];
}>();

const { openProposalDetail } = useProposalDetailSlideover();

function taskLine(change: ActiveChange): string {
  return change.taskTitle ?? "自由讨论";
}

function createdLabel(change: ActiveChange): string {
  return change.createdAt ? timeAgo(new Date(change.createdAt)) : "未知时间";
}

function openChange(changeId: string): void {
  void openProposalDetail(changeId);
}
</script>

<template>
  <section class="space-y-3" data-test="overview-active-changes">
    <div class="flex items-center justify-between gap-3">
      <h2
        class="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 dark:text-primary-400"
      >
        <span class="size-1.5 rounded-full bg-primary-600 dark:bg-primary-400" />
        进行中
      </h2>
      <span class="text-xs text-muted">{{ props.changes.length }} 个提案</span>
    </div>

    <AppEmptyState
      v-if="props.changes.length === 0"
      icon="i-lucide-file-pen"
      title="暂无进行中的提案"
      description="选择任务发起讨论，或从对话直接开始，以推进工作。"
      compact
    />

    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <UiSurface
        v-for="change in props.changes"
        :key="change.id"
        as="button"
        variant="flat"
        padding="sm"
        class="cursor-pointer border border-default !bg-default text-left hover:!bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        @click="openChange(change.id)"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0 space-y-2">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ change.title }}
            </p>
            <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-list-checks" class="size-3.5 shrink-0" />
              <span class="truncate">{{ taskLine(change) }}</span>
            </p>
          </div>
          <div
            class="flex shrink-0 flex-col items-end gap-2 text-right"
            data-test="overview-active-change-meta"
          >
            <UBadge
              :color="proposalDisplayStatusConfig[change.status].color"
              :variant="proposalDisplayStatusConfig[change.status].variant"
              size="sm"
              class="font-normal"
            >
              {{ proposalDisplayStatusConfig[change.status].label }}
            </UBadge>
            <span class="text-xs text-muted">{{ createdLabel(change) }}</span>
          </div>
        </div>
      </UiSurface>
    </div>
  </section>
</template>
