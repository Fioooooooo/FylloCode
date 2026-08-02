import { ref } from "vue";
import { defineStore } from "pinia";
import { proposalBrowserApi } from "@renderer/api/proposal/browser";
import { useWorkspaceStore } from "../workspace/workspace";
import type {
  ProposalMeta,
  ProposalRef,
  ProposalStatusChangedPayload,
} from "@shared/types/proposal";

export const useProposalStore = defineStore("proposal", () => {
  const proposals = ref<ProposalMeta[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadProposals(): Promise<void> {
    const workspaceStore = useWorkspaceStore();
    const workspaceId = workspaceStore.currentWorkspace?.id;

    if (!workspaceId) {
      proposals.value = [];
      error.value = "当前没有选中的项目";
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const result = await proposalBrowserApi.list(workspaceId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      proposals.value = result.data;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      proposals.value = [];
    } finally {
      loading.value = false;
    }
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
    proposals,
    loading,
    error,
    loadProposals,
    watchProposal,
    onStatusChanged,
  };
});
