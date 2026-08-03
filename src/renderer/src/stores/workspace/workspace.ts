import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { workspaceApi } from "@renderer/api/workspace/workspace";
import { windowApi } from "@renderer/api/workspace/window";
import {
  presentWorkspaceError,
  workspacePrimaryDirectoryLabel,
  workspaceSubjectLabel,
} from "@renderer/utils/workspace-presentation";
import { useSessionStore } from "../session/session";
import type {
  CreateCollectionWorkspaceInput,
  FolderMeta,
  UpdateWorkspaceDefinitionInput,
  WorkspaceInfo,
  WorkspaceLauncherItem,
} from "@shared/types/workspace";
import type { IpcErrorInfo } from "@shared/types/ipc";
import type { WindowContext } from "@shared/types/window";

type WorkspaceContextError = Pick<IpcErrorInfo, "code" | "message">;

function sortByLastOpened(workspaces: WorkspaceLauncherItem[]): WorkspaceLauncherItem[] {
  return [...workspaces].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
}

function toLauncherItem(workspace: WorkspaceInfo): WorkspaceLauncherItem {
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceKind: workspace.kind,
    primaryFolderId: workspace.primaryFolderId,
    primaryFolderPath: workspace.primaryFolder.path,
    folderCount: workspace.folders.length,
    folderPaths: workspace.folders.map((folder) => folder.folderPath),
    folders: workspace.folders,
    missingFolderCount: workspace.missingFolders.length,
    lastOpenedAt: workspace.lastOpenedAt,
    isDeleted: workspace.isDeleted,
    cleanupState: workspace.cleanupState,
    legacyAppDataKey: workspace.legacyAppDataKey,
  };
}

function operationError(error: IpcErrorInfo): Error & IpcErrorInfo {
  return Object.assign(new Error(error.message), error);
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const toast = useToast();
  const workspaces = ref<WorkspaceLauncherItem[]>([]);
  const deletedWorkspaces = ref<WorkspaceLauncherItem[]>([]);
  const currentWorkspace = ref<WorkspaceInfo | null>(null);
  const windowContext = ref<WindowContext | null>(null);
  const workspaceContextError = ref<WorkspaceContextError | null>(null);
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const loadError = ref<IpcErrorInfo | null>(null);
  const mutationGeneration = ref(0);
  let loadPromise: Promise<void> | null = null;

  const hasCurrentWorkspace = computed(() => currentWorkspace.value !== null);
  const recentWorkspaces = computed(() => workspaces.value.slice(0, 10));

  function replaceWorkspaces(items: WorkspaceLauncherItem[]): void {
    workspaces.value = sortByLastOpened(items);
  }

  function upsertWorkspace(workspace: WorkspaceInfo): void {
    const item = toLauncherItem(workspace);
    const index = workspaces.value.findIndex((candidate) => candidate.workspaceId === workspace.id);

    if (index === -1) {
      workspaces.value.unshift(item);
    } else {
      workspaces.value.splice(index, 1, {
        ...workspaces.value[index],
        ...item,
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

  function notifyMissingWorkspace(workspace: WorkspaceLauncherItem): void {
    toast.add({
      title: `${workspacePrimaryDirectoryLabel(workspace.workspaceKind)}不存在`,
      description: `${workspace.workspaceName}：${workspace.primaryFolderPath}`,
      color: "error",
    });
  }

  function notifyWindowOpenError(error: IpcErrorInfo, kind?: WorkspaceInfo["kind"]): void {
    toast.add({
      title: `无法打开 ${workspaceSubjectLabel(kind)}`,
      description: presentWorkspaceError(error, kind),
      color: "error",
    });
  }

  async function loadWorkspaces(): Promise<void> {
    if (loadPromise) {
      return loadPromise;
    }

    const expectedGeneration = mutationGeneration.value;
    loadPromise = (async () => {
      isLoading.value = true;
      loadError.value = null;
      const result = await workspaceApi.list();
      if (!result.ok) {
        loadError.value = result.error;
        throw operationError(result.error);
      }

      if (mutationGeneration.value === expectedGeneration) {
        replaceWorkspaces(result.data);
      }
      isLoaded.value = true;
    })();

    try {
      await loadPromise;
    } finally {
      loadPromise = null;
      isLoading.value = false;
    }
  }

  async function loadDeletedWorkspaces(): Promise<void> {
    const result = await workspaceApi.listDeleted();
    if (!result.ok) throw operationError(result.error);
    deletedWorkspaces.value = result.data;
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
      throw operationError(result.error);
    }
    return result.data;
  }

  async function openWorkspaceWindow(workspaceId: string): Promise<WorkspaceInfo | null> {
    const workspaceKind = workspaces.value.find(
      (workspace) => workspace.workspaceId === workspaceId
    )?.workspaceKind;
    const result = await windowApi.openWorkspace(workspaceId);
    if (!result.ok) {
      if (result.error.code === "WORKSPACE_PRIMARY_FOLDER_MISSING") {
        notifyWindowOpenError(result.error, workspaceKind);
        return null;
      }
      throw operationError(result.error);
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
        notifyWindowOpenError(result.error, "folder");
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

  async function openRecentWorkspace(
    workspace: WorkspaceLauncherItem
  ): Promise<WorkspaceInfo | null> {
    if (
      workspace.folders.find((folder) => folder.folderId === workspace.primaryFolderId)?.pathMissing
    ) {
      notifyMissingWorkspace(workspace);
      return null;
    }

    return openWorkspaceWindow(workspace.workspaceId);
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
    const result = await workspaceApi.softDelete(workspaceId);
    if (!result.ok) {
      throw operationError(result.error);
    }

    workspaces.value = workspaces.value.filter(
      (workspace) => workspace.workspaceId !== workspaceId
    );
    mutationGeneration.value += 1;
    if (currentWorkspace.value?.id === workspaceId) {
      clearCurrentWorkspace();
    }
    await loadDeletedWorkspaces();
  }

  async function selectFolder(): Promise<FolderMeta | null> {
    const result = await workspaceApi.selectFolder();
    if (!result.ok) throw operationError(result.error);
    return result.data;
  }

  async function createCollection(input: CreateCollectionWorkspaceInput): Promise<WorkspaceInfo> {
    const result = await workspaceApi.createCollection(input);
    if (!result.ok) throw operationError(result.error);
    mutationGeneration.value += 1;
    upsertWorkspace(result.data);
    return result.data;
  }

  async function updateDefinition(input: UpdateWorkspaceDefinitionInput): Promise<WorkspaceInfo> {
    const expectedWorkspaceId = currentWorkspace.value?.id;
    const result = await workspaceApi.updateDefinition(input);
    if (!result.ok) throw operationError(result.error);
    mutationGeneration.value += 1;
    upsertWorkspace(result.data);
    if (
      expectedWorkspaceId === result.data.id &&
      currentWorkspace.value?.id === expectedWorkspaceId
    ) {
      currentWorkspace.value = result.data;
    }
    return result.data;
  }

  async function restoreDeletedWorkspace(workspaceId: string): Promise<WorkspaceInfo> {
    const result = await workspaceApi.restore(workspaceId);
    if (!result.ok) throw operationError(result.error);
    mutationGeneration.value += 1;
    deletedWorkspaces.value = deletedWorkspaces.value.filter(
      (workspace) => workspace.workspaceId !== workspaceId
    );
    upsertWorkspace(result.data);
    return result.data;
  }

  async function permanentlyDeleteWorkspace(workspaceId: string): Promise<void> {
    const result = await workspaceApi.permanentlyDelete(workspaceId);
    if (!result.ok) {
      await loadDeletedWorkspaces();
      throw operationError(result.error);
    }
    mutationGeneration.value += 1;
    deletedWorkspaces.value = deletedWorkspaces.value.filter(
      (workspace) => workspace.workspaceId !== workspaceId
    );
  }

  async function relocateFolder(
    folderId: string,
    confirmHistoricalSessions = false
  ): Promise<FolderMeta | null> {
    const expectedWorkspaceId = currentWorkspace.value?.id;
    const result = await workspaceApi.relocateFolder(folderId, confirmHistoricalSessions);
    if (!result.ok) throw operationError(result.error);
    if (result.data) mutationGeneration.value += 1;
    if (result.data && expectedWorkspaceId && currentWorkspace.value?.id === expectedWorkspaceId) {
      await refreshCurrentWorkspace();
      await loadWorkspaces();
    }
    return result.data;
  }

  return {
    workspaces,
    deletedWorkspaces,
    recentWorkspaces,
    currentWorkspace,
    windowContext,
    workspaceContextError,
    hasCurrentWorkspace,
    isLoaded,
    isLoading,
    loadError,
    mutationGeneration,
    setCurrentWorkspace,
    bindCurrentWorkspace,
    clearCurrentWorkspace,
    bootstrapWindowWorkspace,
    loadWorkspaces,
    loadDeletedWorkspaces,
    ensureLoaded,
    getWorkspace,
    openFolder,
    openFolderWindow,
    openLauncherWindow,
    openRecentWorkspace,
    openWorkspaceWindow,
    switchWorkspace,
    refreshCurrentWorkspace,
    removeRecentWorkspace,
    selectFolder,
    createCollection,
    updateDefinition,
    restoreDeletedWorkspace,
    permanentlyDeleteWorkspace,
    relocateFolder,
  };
});
