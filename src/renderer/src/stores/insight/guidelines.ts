import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { guidelinesApi } from "@renderer/api/insight/guidelines";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { GuidelineBrowserItem, GuidelinesBrowserOverview } from "@shared/types/guidelines";

export type { GuidelineBrowserItem, GuidelinesBrowserOverview };

export const useGuidelinesStore = defineStore("guidelines", () => {
  const workspaceStore = useWorkspaceStore();
  const data = ref<GuidelinesBrowserOverview | null>(null);
  const selectedFolderId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const folders = computed(() => data.value?.folders ?? []);
  const visibleItems = computed(() => {
    const items = data.value?.items ?? [];
    return selectedFolderId.value
      ? items.filter((item) => item.ref.folderId === selectedFolderId.value)
      : items;
  });
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
      const response = await guidelinesApi.getBrowser(resolvedWorkspaceId);
      if (
        requestGeneration !== loadGeneration ||
        workspaceStore.currentWorkspace?.id !== resolvedWorkspaceId
      ) {
        return;
      }

      if (response.ok) {
        data.value = response.data;
        if (
          selectedFolderId.value &&
          !response.data.folders.some((folder) => folder.folderId === selectedFolderId.value)
        ) {
          selectedFolderId.value = null;
        }
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
      error.value = err instanceof Error ? err.message : "项目准则加载失败";
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
    selectedFolderId.value = null;
    loading.value = false;
    error.value = null;
  }

  function setFolderFilter(folderId: string | null): void {
    selectedFolderId.value = folderId;
  }

  return {
    data,
    folders,
    visibleItems,
    selectedFolderId,
    loading,
    error,
    load,
    clear,
    setFolderFilter,
  };
});
