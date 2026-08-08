<script setup lang="ts">
import { computed, ref } from "vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import ProposalWorktreeBadge from "@renderer/components/proposal/ProposalWorktreeBadge.vue";
import { timeAgo } from "@renderer/utils/time";
import {
  useChatStore,
  // Proposal 运行入口待重构，方案确定后恢复或删除。
  // useWorkflowStore,
  useWorkspaceStore,
  useProposalRunStore,
  useProposalStore,
  useSessionStore,
} from "@renderer/stores";
import {
  getProposalDisplayStatus,
  proposalDisplayStatusConfig,
} from "@renderer/utils/proposal-display-status";
import { proposalRefKey, type ProposalMeta, type ProposalRef } from "@shared/types/proposal";

defineProps<{
  proposals: ProposalMeta[];
}>();

const collapsed = ref(false);

const { openProposalDetail } = useProposalDetailSlideover();
const workspaceStore = useWorkspaceStore();
const proposalStore = useProposalStore();
const chatStore = useChatStore();
// Proposal 运行入口待重构，方案确定后恢复或删除。
// const workflowStore = useWorkflowStore();
const proposalRunStore = useProposalRunStore();
const sessionStore = useSessionStore();

const workspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? "");

// Proposal 运行入口待重构，方案确定后恢复或删除。
// function buildWorkflowMenuItems(proposal: ProposalMeta) {
//   return [
//     workflowStore.customTemplates.map((template) => ({
//       label: template.name,
//       onSelect: () => startApply(proposal, template.id),
//     })),
//   ];
// }

function findLatestProposal(proposalRef: ProposalRef): ProposalMeta | null {
  const key = proposalRefKey(proposalRef);
  return (
    proposalStore.proposals.find((proposal) => proposalRefKey(proposal.proposalRef) === key) ?? null
  );
}

// Proposal 运行入口待重构，方案确定后恢复或删除。
// async function ensureWorkflowsLoaded(): Promise<void> {
//   if (workflowStore.customTemplates.length > 0 || workflowStore.isLoading) {
//     return;
//   }
//   await workflowStore.fetchTemplates();
// }
//
// async function startApply(proposal: ProposalMeta, workflowId: string): Promise<void> {
//   if (!workspaceId.value) {
//     return;
//   }
//   await proposalRunStore.startRun(workspaceId.value, proposal.proposalRef, workflowId);
//   // Optimistically update the rail status so the UI reflects "applying"
//   // immediately, even if the watcher was not active before the apply started.
//   const sessionId = sessionStore.activeSession?.id;
//   if (sessionId) {
//     sessionStore.upsertSessionProposal(sessionId, { ...proposal, status: "applying" });
//   }
// }

async function startApply(proposal: ProposalMeta): Promise<void> {
  await chatStore.sendMessage([
    {
      type: "text",
      text: `Start applying proposal: ${proposal.proposalRef.changeId} (folderId: ${proposal.proposalRef.folderId})`,
    },
  ]);
}

async function startArchive(proposal: ProposalMeta): Promise<void> {
  if (!workspaceId.value) {
    return;
  }
  const proposalRef = proposal.proposalRef;
  await proposalRunStore.startArchive(workspaceId.value, proposalRef);
  await proposalStore.loadProposals();

  const sessionId = sessionStore.activeSession?.id;
  const nextProposal = findLatestProposal(proposalRef);
  if (!sessionId || !nextProposal) {
    return;
  }

  sessionStore.upsertSessionProposal(sessionId, nextProposal);
}

function syncSessionProposalFromStore(proposalRef: ProposalRef): void {
  const sessionId = sessionStore.activeSession?.id;
  const nextProposal = findLatestProposal(proposalRef);
  if (!sessionId || !nextProposal) {
    return;
  }

  sessionStore.upsertSessionProposal(sessionId, nextProposal);
}

async function viewDetail(proposal: ProposalMeta): Promise<void> {
  await openProposalDetail(proposal.proposalRef);
  syncSessionProposalFromStore(proposal.proposalRef);
}

function proposalSummary(proposal: ProposalMeta): string {
  return proposal.why.trim();
}

function createdDateLabel(proposal: ProposalMeta): string {
  if (!proposal.date) {
    return "未知时间";
  }

  const date = new Date(proposal.date);
  if (Number.isNaN(date.getTime())) {
    return proposal.date;
  }

  return timeAgo(date);
}

function hasTaskProgress(proposal: ProposalMeta): boolean {
  return proposal.totalTasks > 0;
}

function taskProgressLabel(proposal: ProposalMeta): string {
  return `${proposal.doneTasks}/${proposal.totalTasks} tasks`;
}
</script>

<template>
  <div class="space-y-1">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 px-1 py-1.5 text-muted hover:text-highlighted transition-colors"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5 shrink-0" />
        <span class="text-sm font-medium uppercase tracking-wide">会话提案</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-xs tabular-nums opacity-70">{{ proposals.length }} 个</span>
        <UIcon
          :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
          class="w-3.5 h-3.5 opacity-70"
        />
      </div>
    </button>

    <div v-show="!collapsed" class="space-y-2">
      <UiSurface
        v-for="proposal in proposals"
        :key="proposalRefKey(proposal.proposalRef)"
        variant="flat"
        padding="sm"
        class="space-y-2 border border-default"
        data-test="chat-proposal-item"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted truncate">{{ proposal.title }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UBadge
              :color="
                proposalDisplayStatusConfig[
                  getProposalDisplayStatus(
                    proposal,
                    proposalRunStore.runMeta,
                    proposalRunStore.isArchiving
                  )
                ].color
              "
              :variant="
                proposalDisplayStatusConfig[
                  getProposalDisplayStatus(
                    proposal,
                    proposalRunStore.runMeta,
                    proposalRunStore.isArchiving
                  )
                ].variant
              "
              size="sm"
            >
              {{
                proposalDisplayStatusConfig[
                  getProposalDisplayStatus(
                    proposal,
                    proposalRunStore.runMeta,
                    proposalRunStore.isArchiving
                  )
                ].label
              }}
            </UBadge>
            <ProposalWorktreeBadge
              v-if="proposal.worktreeMode === 'linked'"
              :worktree-path="proposal.worktreePath"
            />
          </div>
        </div>

        <p
          v-if="proposalSummary(proposal)"
          class="line-clamp-2 text-xs leading-relaxed text-muted"
          data-test="chat-proposal-summary"
        >
          {{ proposalSummary(proposal) }}
        </p>

        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
          data-test="chat-proposal-meta"
        >
          <span class="inline-flex min-w-0 items-center gap-1">
            <UIcon name="i-lucide-folder-git-2" class="size-3 shrink-0" />
            <span class="truncate">{{ proposal.folderName }}</span>
          </span>
          <span class="inline-flex min-w-0 items-center gap-1">
            <UIcon name="i-lucide-calendar" class="size-3 shrink-0" />
            <span class="truncate">{{ createdDateLabel(proposal) }}</span>
          </span>
          <span v-if="hasTaskProgress(proposal)" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-check-square" class="size-3 shrink-0" />
            <span>{{ taskProgressLabel(proposal) }}</span>
          </span>
        </div>

        <div class="flex items-center justify-end gap-2">
          <UButton
            v-if="
              getProposalDisplayStatus(
                proposal,
                proposalRunStore.runMeta,
                proposalRunStore.isArchiving
              ) !== 'creating'
            "
            size="xs"
            color="neutral"
            variant="ghost"
            data-test="view-detail-button"
            @click="viewDetail(proposal)"
          >
            查看详情
          </UButton>

          <!-- Proposal 运行入口待重构，方案确定后恢复或删除。
          <UDropdownMenu
            v-if="proposal.status === 'draft'"
            :items="buildWorkflowMenuItems(proposal)"
            :loading="workflowStore.isLoading"
          >
            <UButton
              size="xs"
              color="primary"
              icon="i-lucide-play"
              trailing-icon="i-lucide-chevron-down"
              data-test="start-apply-button"
              @click="ensureWorkflowsLoaded"
            >
              开始实现
            </UButton>
          </UDropdownMenu>
          -->

          <UButton
            v-if="proposal.status === 'draft'"
            size="xs"
            color="primary"
            data-test="start-apply-button"
            @click="startApply(proposal)"
          >
            开始实现
          </UButton>

          <UButton
            v-if="
              getProposalDisplayStatus(
                proposal,
                proposalRunStore.runMeta,
                proposalRunStore.isArchiving
              ) === 'archiveReady'
            "
            size="xs"
            color="neutral"
            icon="i-lucide-archive"
            data-test="archive-button"
            @click="startArchive(proposal)"
          >
            归档
          </UButton>
        </div>
      </UiSurface>
    </div>
  </div>
</template>
