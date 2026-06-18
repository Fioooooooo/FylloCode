<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  useProjectStore,
  useProposalRunStore,
  useSessionStore,
  useWorkflowStore,
} from "@renderer/stores";
import type { ProposalMeta, ProposalStatus } from "@shared/types/proposal";

defineProps<{
  proposals: ProposalMeta[];
}>();

const router = useRouter();
const projectStore = useProjectStore();
const workflowStore = useWorkflowStore();
const proposalRunStore = useProposalRunStore();
const sessionStore = useSessionStore();

const projectId = computed(() => projectStore.currentProject?.id ?? "");

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
  applying: { label: "实施中", color: "primary", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

function buildWorkflowMenuItems(proposal: ProposalMeta) {
  return [
    workflowStore.customTemplates.map((template) => ({
      label: template.name,
      onSelect: () => startApply(proposal, template.id),
    })),
  ];
}

function canArchive(proposal: ProposalMeta): boolean {
  return (
    proposal.status === "applying" &&
    proposalRunStore.runMeta?.status === "done" &&
    proposalRunStore.runMeta?.changeId === proposal.id
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
  await proposalRunStore.startArchive(projectId.value, proposal.id);
}

function viewDetail(proposal: ProposalMeta): void {
  void router.push(`/proposal/${proposal.id}`);
}
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-xs font-semibold text-muted uppercase tracking-wider">Proposals</h3>

    <div
      v-for="proposal in proposals"
      :key="proposal.id"
      class="rounded-lg border border-default bg-default p-3 space-y-2"
      data-test="chat-proposal-item"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted truncate">{{ proposal.title }}</p>
          <p class="text-xs text-muted truncate">{{ proposal.id }}</p>
        </div>
        <UBadge
          :color="statusConfig[proposal.status].color"
          :variant="statusConfig[proposal.status].variant"
          size="sm"
        >
          {{ statusConfig[proposal.status].label }}
        </UBadge>
      </div>

      <div class="flex items-center justify-end gap-2">
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
          v-else-if="canArchive(proposal)"
          size="xs"
          color="neutral"
          icon="i-lucide-archive"
          data-test="archive-button"
          @click="startArchive(proposal)"
        >
          归档
        </UButton>

        <UButton
          v-else
          size="xs"
          color="neutral"
          variant="ghost"
          data-test="view-detail-button"
          @click="viewDetail(proposal)"
        >
          查看详情
        </UButton>
      </div>
    </div>
  </div>
</template>
