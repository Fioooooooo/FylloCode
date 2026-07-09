<script setup lang="ts">
import { onMounted } from "vue";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import ProposalWorktreeBadge from "@renderer/components/proposal/ProposalWorktreeBadge.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import { useProposalStore } from "@renderer/stores";
import type { ProposalStatus } from "@shared/types/proposal";

const store = useProposalStore();
const { openProposalDetail } = useProposalDetailSlideover();

const statusConfig: Record<
  ProposalStatus,
  {
    label: string;
    color: "neutral" | "primary" | "warning" | "success" | "error" | "info" | "secondary";
    variant: "soft" | "outline" | "subtle";
  }
> = {
  creating: { label: "创建中", color: "primary", variant: "soft" },
  draft: { label: "草稿", color: "neutral", variant: "soft" },
  applying: { label: "实现中", color: "warning", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

function openDetail(id: string): void {
  void openProposalDetail(id);
}

onMounted(() => {
  void store.loadProposals();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-elevated" data-test="proposal-page">
    <div class="flex flex-1 flex-col overflow-hidden rounded-lg bg-default">
      <div class="shrink-0 border-b border-default/50 px-4 py-4">
        <div class="mx-auto max-w-3xl" data-test="proposal-page-header">
          <PageHeader
            eyebrow="Proposals"
            title="变更提案"
            description="当前项目的 OpenSpec 变更提案列表。"
          />
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <div class="mx-auto max-w-3xl space-y-4" data-test="proposal-page-content">
          <div v-if="store.loading" class="rounded-lg bg-elevated px-4 py-8">
            <div class="flex items-center justify-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              正在加载 proposals
            </div>
          </div>

          <div
            v-else-if="store.error"
            class="rounded-lg border border-error/30 bg-error/5 px-4 py-4"
          >
            <div class="flex items-start gap-2 text-sm text-error">
              <UIcon name="i-lucide-circle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
              <span>{{ store.error }}</span>
            </div>
          </div>

          <AppEmptyState
            v-else-if="store.proposals.length === 0"
            icon="i-lucide-file-question"
            title="暂无 proposal"
            description="当前项目还没有变更提案。"
            data-test="proposal-empty-state"
          />

          <div v-else class="space-y-3" data-test="proposal-list">
            <UiSurface
              v-for="proposal in store.proposals"
              :key="proposal.id"
              as="button"
              interactive
              padding="sm"
              class="text-left w-full"
              data-test="proposal-list-item"
              @click="openDetail(proposal.id)"
            >
              <div class="space-y-2.5">
                <div class="flex items-start justify-between gap-3">
                  <span class="text-sm font-medium text-highlighted">{{ proposal.title }}</span>
                  <div class="flex items-center gap-2 shrink-0">
                    <UBadge
                      :color="statusConfig[proposal.status].color"
                      :variant="statusConfig[proposal.status].variant"
                      size="sm"
                      class="shrink-0 mt-0.5"
                    >
                      {{ statusConfig[proposal.status].label }}
                    </UBadge>
                    <ProposalWorktreeBadge :worktree-path="proposal.worktreePath" />
                  </div>
                </div>
                <p class="text-xs text-muted line-clamp-2 leading-relaxed">{{ proposal.why }}</p>
                <div class="flex items-center gap-3 text-xs text-muted pt-0.5">
                  <span class="flex items-center gap-1">
                    <UIcon name="i-lucide-calendar" class="w-3 h-3" />
                    {{ proposal.date }}
                  </span>
                  <span class="flex items-center gap-1">
                    <UIcon name="i-lucide-check-square" class="w-3 h-3" />
                    {{ proposal.doneTasks }}/{{ proposal.totalTasks }} tasks
                  </span>
                </div>
              </div>
            </UiSurface>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
