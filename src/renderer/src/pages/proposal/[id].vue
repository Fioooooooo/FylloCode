<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { proposalApi } from "@renderer/api/proposal";
import ProposalDetailHeader, {
  type DropdownMenuItem,
} from "@renderer/components/proposal/ProposalDetailHeader.vue";
import ProposalMarkdownContent, {
  type MarkdownTab,
  type MarkdownTabValue,
} from "@renderer/components/proposal/ProposalMarkdownContent.vue";
import ProposalApplySidePanel from "@renderer/components/proposal/ProposalApplySidePanel.vue";
import { useProjectStore } from "@renderer/stores/project";
import { useProposalRunStore } from "@renderer/stores/proposal-run";
import { useProposalStore } from "@renderer/stores/proposal";
import { useWorkflowStore } from "@renderer/stores/workflow";
import type { ProposalMeta } from "@shared/types/proposal";
import type { WorkflowTemplate } from "@shared/types/workflow";

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const proposalStore = useProposalStore();
const workflowStore = useWorkflowStore();
const proposalRunStore = useProposalRunStore();

const activeTab = ref<MarkdownTabValue>("proposal");
const tabs = ref<MarkdownTab[]>([]);
const loadingFiles = ref(false);
const fileError = ref<string | null>(null);
const sidePanelOpen = ref(false);

const changeId = computed(() => {
  const value = (route.params as { id?: string | string[] }).id;
  return (Array.isArray(value) ? value[0] : value) ?? "";
});

const currentProposal = computed<ProposalMeta | null>(() => {
  return proposalStore.proposals.find((proposal) => proposal.id === changeId.value) ?? null;
});

const canArchive = computed(() => {
  return (
    currentProposal.value?.status === "applying" && proposalRunStore.runMeta?.status === "done"
  );
});

function buildWorkflowMenuItems(workflows: WorkflowTemplate[]): DropdownMenuItem[] {
  return workflows.map((template) => ({
    label: template.name,
    onSelect: () => void startWithWorkflow(template),
  }));
}

const workflowMenuItems = computed<DropdownMenuItem[][]>(() => {
  if (workflowStore.customTemplates.length === 0) {
    return [];
  }

  return [buildWorkflowMenuItems(workflowStore.customTemplates)];
});

async function ensureProposalLoaded(): Promise<void> {
  if (proposalStore.proposals.length > 0) {
    return;
  }

  await proposalStore.loadProposals();
}

async function loadMarkdownFiles(): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = changeId.value;
  if (!projectId || !changeIdSnapshot) {
    return;
  }

  loadingFiles.value = true;
  fileError.value = null;

  try {
    const fileRequests: Omit<MarkdownTab, "content">[] = [
      { label: "Proposal", value: "proposal", filename: "proposal.md" },
      { label: "Design", value: "design", filename: "design.md" },
      { label: "Tasks", value: "tasks", filename: "tasks.md" },
    ];

    const results = await Promise.all(
      fileRequests.map(async (tab) => {
        const result = await proposalApi.readFile(projectId, changeIdSnapshot, tab.filename);
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        return {
          ...tab,
          content: result.data,
        };
      })
    );

    tabs.value = results;
    activeTab.value = results.find((tab) => tab.content !== null)?.value ?? "proposal";
  } catch (error: unknown) {
    fileError.value = error instanceof Error ? error.message : String(error);
    tabs.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

async function startWithWorkflow(workflow: WorkflowTemplate): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = changeId.value;
  if (!projectId || !changeIdSnapshot) {
    return;
  }

  try {
    await proposalRunStore.startRun(projectId, changeIdSnapshot, workflow.id);
    sidePanelOpen.value = true;
    if (currentProposal.value) {
      currentProposal.value.status = "applying";
    }
  } catch (error: unknown) {
    console.error("Failed to start proposal apply run:", error);
  }
}

async function archiveProposal(): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const previousChangeId = changeId.value;
  if (!projectId || !previousChangeId) {
    return;
  }

  try {
    sidePanelOpen.value = true;
    await proposalRunStore.startArchive(projectId, previousChangeId);
    await proposalStore.loadProposals();

    const nextProposal =
      proposalStore.proposals.find((proposal) => proposal.id === previousChangeId) ??
      proposalStore.proposals.find(
        (proposal) =>
          proposal.status === "archived" &&
          (proposal.id === previousChangeId || proposal.id.endsWith(`-${previousChangeId}`))
      ) ??
      null;

    if (nextProposal && nextProposal.id !== previousChangeId) {
      await router.replace(`/proposal/${nextProposal.id}`);
    }

    await loadMarkdownFiles();
  } catch (error: unknown) {
    console.error("Failed to archive proposal:", error);
  }
}

async function viewRunHistory(): Promise<void> {
  sidePanelOpen.value = true;

  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = changeId.value;
  if (!projectId || !changeIdSnapshot) {
    return;
  }

  try {
    await proposalRunStore.resumeRun(projectId, changeIdSnapshot);
    await proposalRunStore.resumeArchive(projectId, changeIdSnapshot);
  } catch (error: unknown) {
    console.error("Failed to load proposal run history:", error);
  }
}

function backToList(): void {
  void router.push("/proposal");
}

onMounted(() => {
  void (async () => {
    await ensureProposalLoaded();
    await loadMarkdownFiles();
    await workflowStore.fetchTemplates();

    const projectId = projectStore.currentProject?.id;
    const proposal = currentProposal.value;
    if (projectId && proposal?.status === "applying") {
      await proposalRunStore.resumeRun(projectId, changeId.value);
      if (proposalRunStore.runMeta) {
        sidePanelOpen.value = true;
      }
    }

    if (projectId) {
      const hasArchive = await proposalRunStore.resumeArchive(projectId, changeId.value);
      if (hasArchive) {
        sidePanelOpen.value = true;
      }
    }
  })();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-default">
    <div class="flex flex-col flex-1 overflow-hidden min-w-0">
      <ProposalDetailHeader
        :proposal="currentProposal"
        :change-id="changeId"
        :workflow-menu-items="workflowMenuItems"
        :workflow-store-loading="workflowStore.isLoading"
        :run-meta="proposalRunStore.runMeta"
        :is-streaming="proposalRunStore.isStreaming"
        :can-archive="canArchive"
        @back="backToList"
        @open-side-panel="sidePanelOpen = true"
        @view-run-history="viewRunHistory"
        @archive="archiveProposal"
      />

      <ProposalMarkdownContent
        v-model="activeTab"
        :tabs="tabs"
        :loading="loadingFiles"
        :error="fileError"
      />
    </div>

    <ProposalApplySidePanel
      v-if="sidePanelOpen"
      :run-meta="proposalRunStore.runMeta"
      :messages="proposalRunStore.messages"
      :is-streaming="proposalRunStore.isStreaming"
      @close="sidePanelOpen = false"
    />
  </div>
</template>
