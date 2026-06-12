import { ref } from "vue";
import { defineStore } from "pinia";
import { overviewApi } from "@renderer/api/overview";
import { useProjectStore } from "@renderer/stores/project";
import type {
  ActiveChange,
  GovernanceEvolution,
  GuidelineChange,
  OverviewChangeStage,
  OverviewStats,
  ProjectOverview,
  RecentThread,
  SpecsGrowthBucket,
} from "@shared/types/overview";

export type {
  ActiveChange,
  GovernanceEvolution,
  GuidelineChange,
  OverviewChangeStage,
  OverviewStats,
  ProjectOverview,
  RecentThread,
  SpecsGrowthBucket,
};

export const useOverviewStore = defineStore("overview", () => {
  const projectStore = useProjectStore();
  const data = ref<ProjectOverview | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    const project = projectStore.currentProject;
    if (!project) {
      clear();
      return;
    }

    const projectId = project.id;
    loading.value = true;
    error.value = null;
    try {
      const response = await overviewApi.getProjectOverview(projectId);
      if (projectStore.currentProject?.id !== projectId) {
        return;
      }
      if (response.ok) {
        data.value = response.data;
      } else {
        data.value = null;
        error.value = response.error.message;
      }
    } catch (err: unknown) {
      if (projectStore.currentProject?.id !== projectId) {
        return;
      }
      data.value = null;
      error.value = err instanceof Error ? err.message : "项目概览加载失败";
    } finally {
      if (projectStore.currentProject?.id === projectId) {
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
