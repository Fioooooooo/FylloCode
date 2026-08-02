import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { specsApi } from "@renderer/api/insight/specs";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { SpecBrowserItem, SpecsBrowserOverview } from "@shared/types/specs";

export type { SpecBrowserItem, SpecsBrowserOverview };

export const useSpecsStore = defineStore("specs", () => {
  const workspaceStore = useWorkspaceStore();
  const data = ref<SpecsBrowserOverview | null>(null);
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
      const response = await specsApi.getSpecsBrowser(resolvedWorkspaceId);
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
      error.value = err instanceof Error ? err.message : "能力规约加载失败";
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
