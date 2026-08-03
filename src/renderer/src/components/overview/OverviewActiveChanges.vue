<script setup lang="ts">
import { timeAgo } from "@renderer/utils/time";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import ProposalWorktreeBadge from "@renderer/components/proposal/ProposalWorktreeBadge.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import { proposalDisplayStatusConfig } from "@renderer/utils/proposal-display-status";
import { type ActiveChange } from "@renderer/stores";
import { proposalRefKey, type ProposalRef } from "@shared/types/proposal";

const props = defineProps<{
  changes: ActiveChange[];
  showFolderBadge: boolean;
}>();

const { openProposalDetail } = useProposalDetailSlideover();

function taskLine(change: ActiveChange): string {
  return change.taskTitle ?? "自由讨论";
}

function createdLabel(change: ActiveChange): string {
  return change.createdAt ? timeAgo(new Date(change.createdAt)) : "未知时间";
}

function openChange(proposalRef: ProposalRef): void {
  void openProposalDetail(proposalRef);
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
        :key="proposalRefKey(change.proposalRef)"
        as="button"
        variant="flat"
        padding="sm"
        class="cursor-pointer border border-default !bg-default text-left hover:!bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        @click="openChange(change.proposalRef)"
      >
        <div
          class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-3 gap-x-3 gap-y-2"
          data-test="overview-active-change-card-layout"
        >
          <p
            class="truncate self-center text-sm font-semibold text-highlighted"
            :title="change.title"
          >
            {{ change.title }}
          </p>
          <div
            class="flex shrink-0 items-center justify-end gap-2"
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
          </div>
          <span
            class="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-muted"
            data-test="overview-active-change-task"
            :title="taskLine(change)"
          >
            <UIcon name="i-lucide-list-checks" class="size-3.5 shrink-0" />
            <span class="truncate">{{ taskLine(change) }}</span>
          </span>
          <div
            class="flex min-w-0 items-center gap-2 text-xs text-muted"
            data-test="overview-active-change-context"
          >
            <UBadge
              v-if="props.showFolderBadge"
              color="neutral"
              variant="soft"
              size="sm"
              class="max-w-36 shrink-0"
              data-test="overview-active-change-owner"
              :title="change.folderName"
            >
              <span class="truncate">{{ change.folderName }}</span>
            </UBadge>
            <ProposalWorktreeBadge :worktree-path="change.worktreePath" />
          </div>
          <span class="self-center text-right text-xs text-muted">{{ createdLabel(change) }}</span>
        </div>
      </UiSurface>
    </div>
  </section>
</template>
