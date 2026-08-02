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

  async function load(): Promise<void> {
    const project = workspaceStore.currentWorkspace;
    if (!project) {
      clear();
      return;
    }

    const workspaceId = project.id;
    loading.value = true;
    error.value = null;
    try {
      const response = await overviewApi.getProjectOverview(workspaceId);
      if (workspaceStore.currentWorkspace?.id !== workspaceId) {
        return;
      }
      if (response.ok) {
        data.value = response.data;
      } else {
        data.value = null;
        error.value = response.error.message;
      }
    } catch (err: unknown) {
      if (workspaceStore.currentWorkspace?.id !== workspaceId) {
        return;
      }
      data.value = null;
      error.value = err instanceof Error ? err.message : "项目概览加载失败";
    } finally {
      if (workspaceStore.currentWorkspace?.id === workspaceId) {
        loading.value = false;
      }
    }
  }

  function clear(): void {
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
