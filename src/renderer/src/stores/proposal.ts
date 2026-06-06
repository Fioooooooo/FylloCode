import { ref } from "vue";
import { defineStore } from "pinia";
import { proposalApi } from "@renderer/api/proposal";
import { useProjectStore } from "./project";
import type { ProposalMeta } from "@shared/types/proposal";

export const useProposalStore = defineStore("proposal", () => {
  const proposals = ref<ProposalMeta[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadProposals(): Promise<void> {
    const projectStore = useProjectStore();
    const projectId = projectStore.currentProject?.id;

    if (!projectId) {
      proposals.value = [];
      error.value = "当前没有选中的项目";
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const result = await proposalApi.list(projectId);
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

  return {
    proposals,
    loading,
    error,
    loadProposals,
  };
});
