import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { projectApi } from "@renderer/api/project";
import { useSessionStore } from "./session";
import type { ProjectInfo, RecentProject } from "@shared/types/project";

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

  async function activateProject(project: ProjectInfo): Promise<ProjectInfo> {
    const normalized = normalizeProject(project);
    upsertProject(normalized);
    await setCurrentProject(normalized);
    return normalized;
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

  async function openFolder(): Promise<ProjectInfo | null> {
    const result = await projectApi.openFolder();
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      return null;
    }

    const project = normalizeProject(result.data);
    if (project.pathMissing) {
      notifyMissingProject(project);
      return null;
    }

    return await activateProject(project);
  }

  async function openRecentProject(project: RecentProject): Promise<ProjectInfo | null> {
    const result = await projectApi.getById(project.id);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      return null;
    }

    const nextProject = normalizeProject(result.data);
    if (nextProject.pathMissing) {
      notifyMissingProject(nextProject);
      return null;
    }

    const updated = await projectApi.update(nextProject.id, {
      lastOpenedAt: new Date(),
    });
    if (!updated.ok) {
      throw new Error(updated.error.message);
    }

    return await activateProject(updated.data);
  }

  async function switchProject(projectId: string): Promise<ProjectInfo | null> {
    const result = await projectApi.getById(projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      return null;
    }

    const project = normalizeProject(result.data);
    if (project.pathMissing) {
      notifyMissingProject(project);
      return null;
    }

    const updated = await projectApi.update(project.id, {
      lastOpenedAt: new Date(),
    });
    if (!updated.ok) {
      throw new Error(updated.error.message);
    }

    return await activateProject(updated.data);
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
    hasCurrentProject,
    isLoaded,
    setCurrentProject,
    clearCurrentProject,
    loadProjects,
    ensureLoaded,
    openFolder,
    openRecentProject,
    switchProject,
    refreshCurrentProject,
    removeRecentProject,
  };
});
