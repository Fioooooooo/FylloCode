import { ref } from "vue";
import { defineStore } from "pinia";
import { overviewApi } from "@renderer/api/insight/overview";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type {
  ActiveChange,
  ActiveChangeStatus,
  GovernanceEvolution,
  GuidelineChange,
  OverviewStats,
  ProjectOverview,
  RecentLineage,
  SpecsGrowthBucket,
} from "@shared/types/overview";

export type {
  ActiveChange,
  ActiveChangeStatus,
  GovernanceEvolution,
  GuidelineChange,
  OverviewStats,
  ProjectOverview,
  RecentLineage,
  SpecsGrowthBucket,
};

export const useOverviewStore = defineStore("overview", () => {
  const workspaceStore = useWorkspaceStore();
  const data = ref<ProjectOverview | null>(null);
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
      const response = await overviewApi.getProjectOverview(resolvedWorkspaceId);
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
      error.value = err instanceof Error ? err.message : "项目概览加载失败";
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
  };
});
