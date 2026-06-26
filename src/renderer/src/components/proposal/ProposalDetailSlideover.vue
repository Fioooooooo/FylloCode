<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
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
import type { ProposalMeta, ProposalSpecDeltaOverview } from "@shared/types/proposal";
import type { WorkflowTemplate } from "@shared/types/workflow";

const props = defineProps<{
  changeId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const projectStore = useProjectStore();
const proposalStore = useProposalStore();
const workflowStore = useWorkflowStore();
// This remains a global run store: Chat EventRail and the detail Slideover share run state.
const proposalRunStore = useProposalRunStore();

const currentChangeId = ref(props.changeId);
const activeTab = ref<MarkdownTabValue>("proposal");
const markdownTabs = ref<MarkdownTab[]>([]);
const specsOverview = ref<ProposalSpecDeltaOverview | null>(null);
const loadingFiles = ref(false);
const loadingSpecs = ref(false);
const fileError = ref<string | null>(null);
const specsError = ref<string | null>(null);
const sidePanelOpen = ref(false);

const currentProposal = computed<ProposalMeta | null>(() => {
  return proposalStore.proposals.find((proposal) => proposal.id === currentChangeId.value) ?? null;
});

const canArchive = computed(() => {
  return (
    currentProposal.value?.status === "applying" && proposalRunStore.runMeta?.status === "done"
  );
});

const specsTabAvailable = computed(
  () => Boolean(specsError.value) || (specsOverview.value?.items.length ?? 0) > 0
);

const tabs = computed<MarkdownTab[]>(() => [
  ...markdownTabs.value,
  {
    label: "Specs",
    value: "specs",
    content: null,
    available: specsTabAvailable.value,
  },
]);

function visibleTabValues(): MarkdownTabValue[] {
  return tabs.value
    .filter((tab) => (tab.value === "specs" ? tab.available : tab.content !== null))
    .map((tab) => tab.value);
}

function syncActiveTab(): void {
  const values = visibleTabValues();
  if (!values.includes(activeTab.value)) {
    activeTab.value = values[0] ?? "proposal";
  }
}

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
  const changeIdSnapshot = currentChangeId.value;
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
        const filename = tab.filename ?? "";
        const result = await proposalApi.readFile(projectId, changeIdSnapshot, filename);
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        return {
          ...tab,
          content: result.data,
        };
      })
    );

    markdownTabs.value = results;
  } catch (error: unknown) {
    fileError.value = error instanceof Error ? error.message : String(error);
    markdownTabs.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

async function loadSpecDeltas(): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = currentChangeId.value;
  if (!projectId || !changeIdSnapshot) {
    return;
  }

  loadingSpecs.value = true;
  specsError.value = null;

  try {
    const result = await proposalApi.getSpecDeltas(projectId, changeIdSnapshot);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    specsOverview.value = result.data;
  } catch (error: unknown) {
    specsError.value = error instanceof Error ? error.message : String(error);
    specsOverview.value = null;
  } finally {
    loadingSpecs.value = false;
  }
}

async function loadDetailFiles(): Promise<void> {
  await Promise.all([loadMarkdownFiles(), loadSpecDeltas()]);
  syncActiveTab();
}

async function startWithWorkflow(workflow: WorkflowTemplate): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = currentChangeId.value;
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
  const previousChangeId = currentChangeId.value;
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
      currentChangeId.value = nextProposal.id;
    }

    await loadDetailFiles();
  } catch (error: unknown) {
    console.error("Failed to archive proposal:", error);
  }
}

async function viewRunHistory(): Promise<void> {
  sidePanelOpen.value = true;

  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = currentChangeId.value;
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

watch(
  () => props.changeId,
  (changeId) => {
    if (!changeId || changeId === currentChangeId.value) {
      return;
    }

    currentChangeId.value = changeId;
    sidePanelOpen.value = false;
    void loadDetailFiles();
  }
);

watch(tabs, syncActiveTab);

onMounted(() => {
  void (async () => {
    await ensureProposalLoaded();
    await loadDetailFiles();
    await workflowStore.fetchTemplates();

    const projectId = projectStore.currentProject?.id;
    const proposal = currentProposal.value;
    if (projectId && proposal?.status === "applying") {
      await proposalRunStore.resumeRun(projectId, currentChangeId.value);
      if (proposalRunStore.runMeta) {
        sidePanelOpen.value = true;
      }
    }

    if (projectId) {
      const hasArchive = await proposalRunStore.resumeArchive(projectId, currentChangeId.value);
      if (hasArchive) {
        sidePanelOpen.value = true;
      }
    }
  })();
});
</script>

<template>
  <USlideover
    :close="false"
    :ui="{
      content: 'w-[min(100vw,1120px)] max-w-none',
      body: 'h-full min-h-0 p-0 sm:p-0',
    }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-1 overflow-hidden bg-default">
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ProposalDetailHeader
            :proposal="currentProposal"
            :change-id="currentChangeId"
            :workflow-menu-items="workflowMenuItems"
            :workflow-store-loading="workflowStore.isLoading"
            :run-meta="proposalRunStore.runMeta"
            :is-streaming="proposalRunStore.isStreaming"
            :can-archive="canArchive"
            @close="emit('close')"
            @open-side-panel="sidePanelOpen = true"
            @view-run-history="viewRunHistory"
            @archive="archiveProposal"
          />

          <ProposalMarkdownContent
            v-model="activeTab"
            :tabs="tabs"
            :loading="loadingFiles"
            :error="fileError"
            :specs-overview="specsOverview"
            :specs-loading="loadingSpecs"
            :specs-error="specsError"
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
  </USlideover>
</template>
