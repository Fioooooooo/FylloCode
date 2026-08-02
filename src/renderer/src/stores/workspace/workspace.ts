import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { workspaceApi } from "@renderer/api/workspace/workspace";
import { windowApi } from "@renderer/api/workspace/window";
import { useSessionStore } from "../session/session";
import type { WorkspaceInfo } from "@shared/types/workspace";
import type { WindowContext } from "@shared/types/window";

interface WorkspaceContextError {
  code: string;
  message: string;
}

function sortByLastOpened(workspaces: WorkspaceInfo[]): WorkspaceInfo[] {
  return [...workspaces].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const toast = useToast();
  const workspaces = ref<WorkspaceInfo[]>([]);
  const currentWorkspace = ref<WorkspaceInfo | null>(null);
  const windowContext = ref<WindowContext | null>(null);
  const workspaceContextError = ref<WorkspaceContextError | null>(null);
  const isLoaded = ref(false);
  let loadPromise: Promise<void> | null = null;

  const hasCurrentWorkspace = computed(() => currentWorkspace.value !== null);
  const recentWorkspaces = computed(() => workspaces.value.slice(0, 10));

  function replaceWorkspaces(items: WorkspaceInfo[]): void {
    workspaces.value = sortByLastOpened(items);
  }

  function upsertWorkspace(workspace: WorkspaceInfo): void {
    const index = workspaces.value.findIndex((item) => item.id === workspace.id);

    if (index === -1) {
      workspaces.value.unshift(workspace);
    } else {
      workspaces.value.splice(index, 1, {
        ...workspaces.value[index],
        ...workspace,
      });
    }

    workspaces.value = sortByLastOpened(workspaces.value);
  }

  async function setCurrentWorkspace(workspace: WorkspaceInfo | null): Promise<void> {
    const sessionStore = useSessionStore();
    currentWorkspace.value = workspace;
    sessionStore.clearSessions();

    if (workspace) {
      await sessionStore.loadSessions(workspace.id);
    }
  }

  async function bindCurrentWorkspace(workspace: WorkspaceInfo): Promise<WorkspaceInfo> {
    workspaceContextError.value = null;
    upsertWorkspace(workspace);
    await setCurrentWorkspace(workspace);
    return workspace;
  }

  function clearCurrentWorkspace(): void {
    currentWorkspace.value = null;
    useSessionStore().clearSessions();
  }

  function notifyMissingWorkspace(workspace: WorkspaceInfo): void {
    toast.add({
      title: "工作区目录不存在",
      description: `${workspace.name}: ${workspace.primaryFolder.path}`,
      color: "error",
    });
  }

  function notifyWindowOpenError(message: string): void {
    toast.add({
      title: "无法打开工作区窗口",
      description: message,
      color: "error",
    });
  }

  async function loadWorkspaces(): Promise<void> {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async () => {
      const result = await workspaceApi.list();
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      replaceWorkspaces(result.data);
      isLoaded.value = true;
    })();

    try {
      await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!isLoaded.value) {
      await loadWorkspaces();
    }
  }

  async function bootstrapWindowWorkspace(): Promise<void> {
    const contextResult = await windowApi.getContext();
    if (!contextResult.ok) {
      workspaceContextError.value = contextResult.error;
      clearCurrentWorkspace();
      return;
    }

    windowContext.value = contextResult.data;
    await loadWorkspaces();

    if (contextResult.data.role === "launcher") {
      workspaceContextError.value = null;
      clearCurrentWorkspace();
      return;
    }

    const result = await workspaceApi.getById(contextResult.data.workspaceId);
    if (!result.ok) {
      workspaceContextError.value = result.error;
      clearCurrentWorkspace();
      return;
    }

    if (!result.data) {
      workspaceContextError.value = {
        code: "WORKSPACE_NOT_FOUND",
        message: `Workspace not found: ${contextResult.data.workspaceId}`,
      };
      clearCurrentWorkspace();
      return;
    }

    if (result.data.pathMissing) {
      workspaceContextError.value = {
        code: "WORKSPACE_PRIMARY_FOLDER_MISSING",
        message: `Workspace primary folder is missing: ${result.data.primaryFolder.path}`,
      };
      clearCurrentWorkspace();
      return;
    }

    await bindCurrentWorkspace(result.data);
  }

  async function getWorkspace(workspaceId: string): Promise<WorkspaceInfo | null> {
    const result = await workspaceApi.getById(workspaceId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.data;
  }

  async function openWorkspaceWindow(workspaceId: string): Promise<WorkspaceInfo | null> {
    const result = await windowApi.openWorkspace(workspaceId);
    if (!result.ok) {
      if (result.error.code === "WORKSPACE_PRIMARY_FOLDER_MISSING") {
        notifyWindowOpenError(result.error.message);
        return null;
      }
      throw new Error(result.error.message);
    }

    await loadWorkspaces();
    if (result.data.status !== "bound-current") {
      return null;
    }

    const workspace = await getWorkspace(result.data.context.workspaceId);
    if (!workspace) {
      return null;
    }

    windowContext.value = result.data.context;
    return bindCurrentWorkspace(workspace);
  }

  async function openFolderWindow(): Promise<WorkspaceInfo | null> {
    const result = await windowApi.openFolder();
    if (!result.ok) {
      if (result.error.code === "WORKSPACE_PRIMARY_FOLDER_MISSING") {
        notifyWindowOpenError(result.error.message);
        return null;
      }
      throw new Error(result.error.message);
    }

    if (result.data.status === "cancelled") {
      return null;
    }

    await loadWorkspaces();
    if (result.data.status !== "bound-current") {
      return null;
    }

    const workspace = await getWorkspace(result.data.context.workspaceId);
    if (!workspace) {
      return null;
    }

    windowContext.value = result.data.context;
    return bindCurrentWorkspace(workspace);
  }

  async function openLauncherWindow(): Promise<void> {
    const result = await windowApi.openLauncher();
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }

  async function openFolder(): Promise<WorkspaceInfo | null> {
    return openFolderWindow();
  }

  async function openRecentWorkspace(workspace: WorkspaceInfo): Promise<WorkspaceInfo | null> {
    if (workspace.pathMissing) {
      notifyMissingWorkspace(workspace);
      return null;
    }

    return openWorkspaceWindow(workspace.id);
  }

  async function switchWorkspace(workspaceId: string): Promise<WorkspaceInfo | null> {
    return openWorkspaceWindow(workspaceId);
  }

  async function refreshCurrentWorkspace(): Promise<void> {
    const workspaceId = currentWorkspace.value?.id;
    if (!workspaceId) {
      return;
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace || currentWorkspace.value?.id !== workspaceId) {
      return;
    }

    upsertWorkspace(workspace);
    currentWorkspace.value = workspace;
  }

  async function removeRecentWorkspace(workspaceId: string): Promise<void> {
    const result = await workspaceApi.remove(workspaceId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    workspaces.value = workspaces.value.filter((workspace) => workspace.id !== workspaceId);
    if (currentWorkspace.value?.id === workspaceId) {
      clearCurrentWorkspace();
    }
  }

  return {
    workspaces,
    recentWorkspaces,
    currentWorkspace,
    windowContext,
    workspaceContextError,
    hasCurrentWorkspace,
    isLoaded,
    setCurrentWorkspace,
    bindCurrentWorkspace,
    clearCurrentWorkspace,
    bootstrapWindowWorkspace,
    loadWorkspaces,
    ensureLoaded,
    openFolder,
    openFolderWindow,
    openLauncherWindow,
    openRecentWorkspace,
    openWorkspaceWindow,
    switchWorkspace,
    refreshCurrentWorkspace,
    removeRecentWorkspace,
  };
});
