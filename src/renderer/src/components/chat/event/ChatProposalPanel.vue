<script setup lang="ts">
import { computed, ref } from "vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import {
  useProjectStore,
  useProposalStore,
  useProposalRunStore,
  useSessionStore,
  useWorkflowStore,
} from "@renderer/stores";
import {
  getProposalDisplayStatus,
  proposalDisplayStatusConfig,
} from "@renderer/utils/proposal-display-status";
import type { ProposalMeta } from "@shared/types/proposal";

defineProps<{
  proposals: ProposalMeta[];
}>();

const collapsed = ref(false);

const { openProposalDetail } = useProposalDetailSlideover();
const projectStore = useProjectStore();
const proposalStore = useProposalStore();
const workflowStore = useWorkflowStore();
const proposalRunStore = useProposalRunStore();
const sessionStore = useSessionStore();

const projectId = computed(() => projectStore.currentProject?.id ?? "");

function buildWorkflowMenuItems(proposal: ProposalMeta) {
  return [
    workflowStore.customTemplates.map((template) => ({
      label: template.name,
      onSelect: () => startApply(proposal, template.id),
    })),
  ];
}

function findArchivedProposal(previousChangeId: string): ProposalMeta | null {
  return (
    proposalStore.proposals.find((proposal) => proposal.id === previousChangeId) ??
    proposalStore.proposals.find(
      (proposal) => proposal.status === "archived" && proposal.id.endsWith(`-${previousChangeId}`)
    ) ??
    null
  );
}

async function ensureWorkflowsLoaded(): Promise<void> {
  if (workflowStore.customTemplates.length > 0 || workflowStore.isLoading) {
    return;
  }
  await workflowStore.fetchTemplates();
}

async function startApply(proposal: ProposalMeta, workflowId: string): Promise<void> {
  if (!projectId.value) {
    return;
  }
  await proposalRunStore.startRun(projectId.value, proposal.id, workflowId);
  // Optimistically update the rail status so the UI reflects "applying"
  // immediately, even if the watcher was not active before the apply started.
  const sessionId = sessionStore.activeSession?.id;
  if (sessionId) {
    sessionStore.upsertSessionProposal(sessionId, { ...proposal, status: "applying" });
  }
}

async function startArchive(proposal: ProposalMeta): Promise<void> {
  if (!projectId.value) {
    return;
  }
  const previousChangeId = proposal.id;
  await proposalRunStore.startArchive(projectId.value, previousChangeId);
  await proposalStore.loadProposals();

  const sessionId = sessionStore.activeSession?.id;
  const nextProposal = findArchivedProposal(previousChangeId);
  if (!sessionId || !nextProposal) {
    return;
  }

  if (nextProposal.id !== previousChangeId) {
    sessionStore.removeSessionProposal(sessionId, previousChangeId);
  }
  sessionStore.upsertSessionProposal(sessionId, nextProposal);
}

function viewDetail(proposal: ProposalMeta): void {
  void openProposalDetail(proposal.id);
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
        :key="proposal.id"
        variant="flat"
        padding="sm"
        class="space-y-2 border border-default"
        data-test="chat-proposal-item"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted truncate">{{ proposal.title }}</p>
            <p class="text-xs text-muted truncate">{{ proposal.id }}</p>
          </div>
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
            class="shrink-0"
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
