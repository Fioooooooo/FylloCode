import { ref } from "vue";
import { defineStore } from "pinia";
import { knowledgeApi } from "@renderer/api/insight/knowledge";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { KnowledgeBrowserOverview } from "@shared/types/knowledge";

export type {
  KnowledgeBrowserEntry,
  KnowledgeBrowserError,
  KnowledgeBrowserOverview,
} from "@shared/types/knowledge";

export const useKnowledgeStore = defineStore("knowledge", () => {
  const workspaceStore = useWorkspaceStore();
  const data = ref<KnowledgeBrowserOverview | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let loadGeneration = 0;

  async function load(workspaceId?: string): Promise<void> {
    const resolvedWorkspaceId = workspaceId ?? workspaceStore.currentWorkspace?.id;
    if (!resolvedWorkspaceId) {
      clear();
      return;
    }

    const requestGeneration = ++loadGeneration;
    loading.value = true;
    error.value = null;
    try {
      const response = await knowledgeApi.getBrowser(resolvedWorkspaceId);
      if (
        requestGeneration !== loadGeneration ||
        workspaceStore.currentWorkspace?.id !== resolvedWorkspaceId
      ) {
        return;
      }

      if (response.ok) {
        data.value = response.data;
      } else {
        data.value = null;
        error.value = response.error.message;
      }
    } catch (err: unknown) {
      if (
        requestGeneration !== loadGeneration ||
        workspaceStore.currentWorkspace?.id !== resolvedWorkspaceId
      ) {
        return;
      }

      data.value = null;
      error.value = err instanceof Error ? err.message : "知识沉淀加载失败";
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
    loading.value = false;
    error.value = null;
  }

  return {
    data,
    loading,
    error,
    load,
    clear,
    readEntry: knowledgeApi.readEntry,
    saveEntry: knowledgeApi.saveEntry,
    deleteEntry: knowledgeApi.deleteEntry,
  };
});
