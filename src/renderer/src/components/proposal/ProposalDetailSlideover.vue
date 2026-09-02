<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { proposalBrowserApi } from "@renderer/api/proposal/browser";
import ProposalDetailHeader from "@renderer/components/proposal/ProposalDetailHeader.vue";
import ProposalMarkdownContent, {
  type MarkdownTab,
  type MarkdownTabValue,
} from "@renderer/components/proposal/ProposalMarkdownContent.vue";
import { useWorkspaceStore, useProposalStore } from "@renderer/stores";
import {
  proposalRefKey,
  type ProposalMeta,
  type ProposalRef,
  type ProposalSpecDeltaOverview,
} from "@shared/types/proposal";
const props = defineProps<{
  proposalRef: ProposalRef;
}>();

const emit = defineEmits<{
  close: [];
}>();

const workspaceStore = useWorkspaceStore();
const proposalStore = useProposalStore();

const currentProposalRef = ref<ProposalRef>({ ...props.proposalRef });
const activeTab = ref<MarkdownTabValue>("proposal");
const markdownTabs = ref<MarkdownTab[]>([]);
const specsOverview = ref<ProposalSpecDeltaOverview | null>(null);
const loadingFiles = ref(false);
const loadingSpecs = ref(false);
const fileError = ref<string | null>(null);
const specsError = ref<string | null>(null);
const refreshingMeta = ref(false);
const fallbackProposal = ref<ProposalMeta | null>(null);

let detailRequestId = 0;

function beginDetailRequest(): number {
  detailRequestId += 1;
  return detailRequestId;
}

function isCurrentRequest(requestId: number): boolean {
  return requestId === detailRequestId;
}

function findCurrentProposal(): ProposalMeta | null {
  const currentKey = proposalRefKey(currentProposalRef.value);
  return (
    proposalStore.proposals.find(
      (proposal) => proposalRefKey(proposal.proposalRef) === currentKey
    ) ?? null
  );
}

const currentProposal = computed<ProposalMeta | null>(() => {
  const proposal = findCurrentProposal();
  if (proposal) {
    return proposal;
  }

  return fallbackProposal.value &&
    proposalRefKey(fallbackProposal.value.proposalRef) === proposalRefKey(currentProposalRef.value)
    ? fallbackProposal.value
    : null;
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

async function refreshProposalMeta(requestId: number): Promise<void> {
  const fallback = currentProposal.value;
  fallbackProposal.value = fallback ? { ...fallback } : null;
  refreshingMeta.value = true;

  try {
    await proposalStore.loadProposals();
    if (!isCurrentRequest(requestId)) {
      return;
    }

    if (findCurrentProposal()) {
      fallbackProposal.value = null;
    } else if (!proposalStore.error) {
      fallbackProposal.value = null;
    }
  } catch {
    // Keep the captured fallback visible; metadata refresh is background-only.
  } finally {
    if (isCurrentRequest(requestId)) {
      refreshingMeta.value = false;
    }
  }
}

async function loadMarkdownFiles(requestId: number): Promise<void> {
  const workspaceId = workspaceStore.currentWorkspace?.id;
  const proposalRefSnapshot = { ...currentProposalRef.value };
  if (!workspaceId) {
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
        const result = await proposalBrowserApi.readFile(
          workspaceId,
          proposalRefSnapshot,
          filename
        );
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        return {
          ...tab,
          content: result.data,
        };
      })
    );

    if (!isCurrentRequest(requestId)) {
      return;
    }

    markdownTabs.value = results;
  } catch (error: unknown) {
    if (!isCurrentRequest(requestId)) {
      return;
    }

    fileError.value = error instanceof Error ? error.message : String(error);
    markdownTabs.value = [];
  } finally {
    if (isCurrentRequest(requestId)) {
      loadingFiles.value = false;
    }
  }
}

async function loadSpecDeltas(requestId: number): Promise<void> {
  const workspaceId = workspaceStore.currentWorkspace?.id;
  const proposalRefSnapshot = { ...currentProposalRef.value };
  if (!workspaceId) {
    return;
  }

  loadingSpecs.value = true;
  specsError.value = null;

  try {
    const result = await proposalBrowserApi.getSpecDeltas(workspaceId, proposalRefSnapshot);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!isCurrentRequest(requestId)) {
      return;
    }

    specsOverview.value = result.data;
  } catch (error: unknown) {
    if (!isCurrentRequest(requestId)) {
      return;
    }

    specsError.value = error instanceof Error ? error.message : String(error);
    specsOverview.value = null;
  } finally {
    if (isCurrentRequest(requestId)) {
      loadingSpecs.value = false;
    }
  }
}

async function loadDetailFiles(requestId: number): Promise<void> {
  await Promise.all([loadMarkdownFiles(requestId), loadSpecDeltas(requestId)]);
  if (!isCurrentRequest(requestId)) {
    return;
  }

  syncActiveTab();
}

watch(
  () => proposalRefKey(props.proposalRef),
  () => {
    if (proposalRefKey(props.proposalRef) === proposalRefKey(currentProposalRef.value)) {
      return;
    }

    currentProposalRef.value = { ...props.proposalRef };
    fallbackProposal.value = null;
    const requestId = beginDetailRequest();
    void refreshProposalMeta(requestId);
    void loadDetailFiles(requestId);
  }
);

watch(tabs, syncActiveTab);

onMounted(() => {
  void (async () => {
    const requestId = beginDetailRequest();
    await Promise.all([refreshProposalMeta(requestId), loadDetailFiles(requestId)]);
    if (!isCurrentRequest(requestId)) {
      return;
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
            :change-id="currentProposalRef.changeId"
            :refreshing-meta="refreshingMeta"
            @close="emit('close')"
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
      </div>
    </template>
  </USlideover>
</template>
