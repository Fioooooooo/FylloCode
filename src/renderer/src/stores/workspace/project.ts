import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { projectApi } from "@renderer/api/workspace/project";
import { windowApi } from "@renderer/api/workspace/window";
import { useSessionStore } from "../session/session";
import type { ProjectInfo, RecentProject } from "@shared/types/project";
import type { WindowContext } from "@shared/types/window";

interface ProjectContextError {
  code: string;
  message: string;
}

function normalizeProject(project: ProjectInfo): ProjectInfo {
  return {
    ...project,
    createdAt: new Date(project.createdAt),
    lastOpenedAt: new Date(project.lastOpenedAt),
    pathMissing: project.pathMissing,
  };
}

function toRecentProject(project: ProjectInfo): RecentProject {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    createdAt: project.createdAt,
    lastOpenedAt: project.lastOpenedAt,
    pathMissing: project.pathMissing,
  };
}

function sortByLastOpened<T extends Pick<ProjectInfo, "lastOpenedAt">>(projects: T[]): T[] {
  return [...projects].sort((a, b) => b.lastOpenedAt.getTime() - a.lastOpenedAt.getTime());
}

export const useProjectStore = defineStore("project", () => {
  const toast = useToast();

  const projects = ref<ProjectInfo[]>([]);
  const currentProject = ref<ProjectInfo | null>(null);
  const windowContext = ref<WindowContext | null>(null);
  const projectContextError = ref<ProjectContextError | null>(null);
  const isLoaded = ref(false);
  let loadPromise: Promise<void> | null = null;
  const hasCurrentProject = computed(() => currentProject.value !== null);
  const recentProjects = computed<RecentProject[]>(() =>
    sortByLastOpened(projects.value)
      .slice(0, 10)
      .map((project) => toRecentProject(project))
  );

  async function setCurrentProject(project: ProjectInfo | null): Promise<void> {
    const sessionStore = useSessionStore();
    currentProject.value = project;
    sessionStore.clearSessions();

    if (project) {
      await sessionStore.loadSessions(project.id);
    }
  }

  async function bindCurrentProject(project: ProjectInfo): Promise<ProjectInfo> {
    const normalized = normalizeProject(project);
    projectContextError.value = null;
    upsertProject(normalized);
    await setCurrentProject(normalized);
    return normalized;
  }

  function replaceProjects(items: ProjectInfo[]): void {
    projects.value = sortByLastOpened(items.map(normalizeProject));
  }

  function upsertProject(project: ProjectInfo): void {
    const normalized = normalizeProject(project);
    const index = projects.value.findIndex((item) => item.id === normalized.id);

    if (index === -1) {
      projects.value.unshift(normalized);
    } else {
      projects.value.splice(index, 1, {
        ...projects.value[index],
        ...normalized,
      });
    }

    projects.value = sortByLastOpened(projects.value);
  }

  function clearCurrentProject(): void {
    currentProject.value = null;
    useSessionStore().clearSessions();
  }

  function notifyMissingProject(project: Pick<ProjectInfo, "name" | "path">): void {
    toast.add({
      title: "项目目录不存在",
      description: `${project.name}: ${project.path}`,
      color: "error",
    });
  }

  function notifyWindowOpenError(message: string): void {
    toast.add({
      title: "无法打开项目窗口",
      description: message,
      color: "error",
    });
  }

  async function loadProjects(): Promise<void> {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async () => {
      const result = await projectApi.list();
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      replaceProjects(result.data);
      isLoaded.value = true;
    })();

    try {
      await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (isLoaded.value) {
      return;
    }

    await loadProjects();
  }

  async function bootstrapWindowProject(): Promise<void> {
    await loadProjects();

    const contextResult = await windowApi.getContext();
    if (!contextResult.ok) {
      projectContextError.value = contextResult.error;
      clearCurrentProject();
      return;
    }

    windowContext.value = contextResult.data;

    if (contextResult.data.role === "launcher") {
      projectContextError.value = null;
      clearCurrentProject();
      return;
    }

    const result = await projectApi.getById(contextResult.data.projectId);
    if (!result.ok) {
      projectContextError.value = result.error;
      clearCurrentProject();
      return;
    }

    if (!result.data) {
      projectContextError.value = {
        code: "PROJECT_NOT_FOUND",
        message: `Project not found: ${contextResult.data.projectId}`,
      };
      clearCurrentProject();
      return;
    }

    const project = normalizeProject(result.data);
    if (project.pathMissing) {
      projectContextError.value = {
        code: "PROJECT_PATH_MISSING",
        message: `Project path is missing: ${project.path}`,
      };
      clearCurrentProject();
      return;
    }

    await bindCurrentProject(project);
  }

  async function openProjectWindow(projectId: string): Promise<ProjectInfo | null> {
    const result = await windowApi.openProject(projectId);
    if (!result.ok) {
      if (result.error.code === "PROJECT_PATH_MISSING") {
        notifyWindowOpenError(result.error.message);
        return null;
      }
      throw new Error(result.error.message);
    }

    const openedProject = normalizeProject(result.data.project);
    upsertProject(openedProject);

    if (result.data.status !== "bound-current") {
      return null;
    }

    windowContext.value = result.data.context;
    return bindCurrentProject(openedProject);
  }

  async function openFolderWindow(): Promise<ProjectInfo | null> {
    const result = await windowApi.openFolder();
    if (!result.ok) {
      if (result.error.code === "PROJECT_PATH_MISSING") {
        notifyWindowOpenError(result.error.message);
        return null;
      }
      throw new Error(result.error.message);
    }

    if (result.data.status === "cancelled") {
      return null;
    }

    const openedProject = normalizeProject(result.data.project);
    upsertProject(openedProject);

    if (result.data.status !== "bound-current") {
      return null;
    }

    windowContext.value = result.data.context;
    return bindCurrentProject(openedProject);
  }

  async function openLauncherWindow(): Promise<void> {
    const result = await windowApi.openLauncher();
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }

  async function openFolder(): Promise<ProjectInfo | null> {
    return openFolderWindow();
  }

  async function openRecentProject(project: RecentProject): Promise<ProjectInfo | null> {
    if (project.pathMissing) {
      notifyMissingProject(project);
      return null;
    }

    return openProjectWindow(project.id);
  }

  async function switchProject(projectId: string): Promise<ProjectInfo | null> {
    return openProjectWindow(projectId);
  }

  async function refreshCurrentProject(): Promise<void> {
    const project = currentProject.value;
    if (!project) {
      return;
    }

    const result = await projectApi.getById(project.id);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      return;
    }

    if (currentProject.value?.id !== project.id) {
      return;
    }

    const refreshed = normalizeProject(result.data);
    upsertProject(refreshed);
    currentProject.value = {
      ...currentProject.value,
      ...refreshed,
    };
  }

  async function removeRecentProject(projectId: string): Promise<void> {
    const result = await projectApi.remove(projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    projects.value = projects.value.filter((project) => project.id !== projectId);
    if (currentProject.value?.id === projectId) {
      currentProject.value = null;
      useSessionStore().clearSessions();
    }
  }
  return {
    projects,
    recentProjects,
    currentProject,
    windowContext,
    projectContextError,
    hasCurrentProject,
    isLoaded,
    setCurrentProject,
    bindCurrentProject,
    clearCurrentProject,
    bootstrapWindowProject,
    loadProjects,
    ensureLoaded,
    openFolder,
    openFolderWindow,
    openLauncherWindow,
    openRecentProject,
    openProjectWindow,
    switchProject,
    refreshCurrentProject,
    removeRecentProject,
  };
});
