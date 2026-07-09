import { ref } from "vue";
import { defineStore } from "pinia";
import { specsApi } from "@renderer/api/insight/specs";
import { useProjectStore } from "@renderer/stores/workspace/project";
import type { SpecBrowserItem, SpecsBrowserOverview } from "@shared/types/specs";

export type { SpecBrowserItem, SpecsBrowserOverview };

export const useSpecsStore = defineStore("specs", () => {
  const projectStore = useProjectStore();
  const data = ref<SpecsBrowserOverview | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(projectId?: string): Promise<void> {
    const resolvedProjectId = projectId ?? projectStore.currentProject?.id;
    if (!resolvedProjectId) {
      clear();
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      const response = await specsApi.getSpecsBrowser(resolvedProjectId);
      if (projectStore.currentProject?.id !== resolvedProjectId) {
        return;
      }

      if (response.ok) {
        data.value = response.data;
      } else {
        data.value = null;
        error.value = response.error.message;
      }
    } catch (err: unknown) {
      if (projectStore.currentProject?.id !== resolvedProjectId) {
        return;
      }

      data.value = null;
      error.value = err instanceof Error ? err.message : "能力规约加载失败";
    } finally {
      if (projectStore.currentProject?.id === resolvedProjectId) {
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
