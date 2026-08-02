import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { proposalBrowserApi } from "@renderer/api/proposal/browser";
import { useWorkspaceStore } from "../workspace/workspace";
import type {
  ProposalMeta,
  ProposalBrowserOverview,
  ProposalRef,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const useProposalStore = defineStore("proposal", () => {
  const data = ref<ProposalBrowserOverview | null>(null);
  const proposals = ref<ProposalMeta[]>([]);
  const selectedFolderId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const folders = computed(() => data.value?.folders ?? []);
  const visibleProposals = computed(() =>
    selectedFolderId.value
      ? proposals.value.filter(
          (proposal) => proposal.proposalRef.folderId === selectedFolderId.value
        )
      : proposals.value
  );
  let loadGeneration = 0;

  async function loadProposals(workspaceId?: string): Promise<void> {
    const workspaceStore = useWorkspaceStore();
    const resolvedWorkspaceId = workspaceId ?? workspaceStore.currentWorkspace?.id;

    if (!resolvedWorkspaceId) {
      clear();
      return;
    }

    const requestGeneration = ++loadGeneration;
    loading.value = true;
    error.value = null;

    try {
      const result = await proposalBrowserApi.list(resolvedWorkspaceId);
      if (
        requestGeneration !== loadGeneration ||
        workspaceStore.currentWorkspace?.id !== resolvedWorkspaceId
      ) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      data.value = result.data;
      proposals.value = result.data.items;
      if (
        selectedFolderId.value &&
        !result.data.folders.some((folder) => folder.folderId === selectedFolderId.value)
      ) {
        selectedFolderId.value = null;
      }
    } catch (err: unknown) {
      if (
        requestGeneration !== loadGeneration ||
        workspaceStore.currentWorkspace?.id !== resolvedWorkspaceId
      ) {
        return;
      }
      error.value = err instanceof Error ? err.message : String(err);
      data.value = null;
      proposals.value = [];
    } finally {
      if (
        requestGeneration === loadGeneration &&
        workspaceStore.currentWorkspace?.id === resolvedWorkspaceId
      ) {
        loading.value = false;
      }
    }
  }

  function clear(): void {
    loadGeneration += 1;
    data.value = null;
    proposals.value = [];
    selectedFolderId.value = null;
    loading.value = false;
    error.value = null;
  }

  function setFolderFilter(folderId: string | null): void {
    selectedFolderId.value = folderId;
  }

  function watchProposal(
    input: { workspaceId: string; sessionId: string } & ProposalRef
  ): ReturnType<typeof proposalBrowserApi.watch> {
    return proposalBrowserApi.watch(input);
  }

  function onStatusChanged(handler: (payload: ProposalStatusChangedPayload) => void): () => void {
    return proposalBrowserApi.onStatusChanged(handler);
  }

  return {
    data,
    proposals,
    visibleProposals,
    folders,
    selectedFolderId,
    loading,
    error,
    loadProposals,
    clear,
    setFolderFilter,
    watchProposal,
    onStatusChanged,
  };
});
