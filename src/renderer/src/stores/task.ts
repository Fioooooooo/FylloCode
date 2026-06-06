import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { taskApi } from "@renderer/api/task";
import { integrationApi } from "@renderer/api/integration";
import { useProjectStore } from "./project";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  TaskStatus,
  UpdateTaskInput,
} from "@shared/types/task";
import type { ProjectIntegrationConfig, ProjectIntegrationEntry } from "@shared/types/integration";

type TaskSourceFilter = TaskSource | "all";
type TaskSourceTab = { label: string; value: TaskSource };

const baseSourceTabs: TaskSourceTab[] = [{ label: "本地", value: "local" }];

function isMountedYunxiaoProjexProject(entry: ProjectIntegrationEntry): boolean {
  return entry.providerId === "yunxiao" && entry.resourceType === "projex-project";
}

function hasYunxiaoTaskSource(config: ProjectIntegrationConfig | null): boolean {
  return (config?.["project-management"] ?? []).some(isMountedYunxiaoProjexProject);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    createdAt: toDate(task.createdAt),
    updatedAt: toDate(task.updatedAt),
  };
}

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

export const useTaskStore = defineStore("task", () => {
  const tasks = ref<TaskItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const detailLoadingTaskId = ref<string | null>(null);
  const detailErrorTaskId = ref<string | null>(null);
  const detailErrorMessage = ref<string | null>(null);
  const sourceFilter = ref<TaskSourceFilter>("all");
  const statusFilter = ref<TaskStatus>("open");
  const availableSources = ref<TaskSource[]>(["local"]);
  const projectIntegration = ref<ProjectIntegrationConfig | null>(null);

  const sourceTabs = computed<TaskSourceTab[]>(() => {
    return availableSources.value.map((source) =>
      source === "local" ? baseSourceTabs[0] : { label: "云效", value: "yunxiao" }
    );
  });

  const tasksBySource = computed(() =>
    sourceFilter.value === "all"
      ? tasks.value
      : tasks.value.filter((task) => task.source === sourceFilter.value)
  );

  const filteredTasks = computed(() => {
    if (sourceFilter.value !== "local") {
      return tasksBySource.value;
    }
    return tasksBySource.value.filter((task) => task.status === statusFilter.value);
  });

  function getCurrentProjectId(): string | undefined {
    return useProjectStore().currentProject?.id;
  }

  function resetDetailState(): void {
    detailLoadingTaskId.value = null;
    detailErrorTaskId.value = null;
    detailErrorMessage.value = null;
  }

  function normalizeAvailableSources(): void {
    const sources: TaskSource[] = ["local"];
    if (hasYunxiaoTaskSource(projectIntegration.value)) {
      sources.push("yunxiao");
    }
    availableSources.value = sources;
    if (sourceFilter.value !== "all" && !sources.includes(sourceFilter.value)) {
      sourceFilter.value = "local";
    }
  }

  async function refreshAvailableSources(projectId?: string): Promise<void> {
    if (!projectId) {
      projectIntegration.value = null;
      availableSources.value = ["local"];
      if (sourceFilter.value !== "all") {
        sourceFilter.value = "local";
      }
      return;
    }

    const result = await integrationApi.getProjectIntegration(projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    projectIntegration.value = result.data;
    normalizeAvailableSources();
  }

  function setTasks(items: TaskItem[]): void {
    tasks.value = sortTasks(items.map(normalizeTask));
  }

  function upsertTask(task: TaskItem): void {
    const normalized = normalizeTask(task);
    const index = tasks.value.findIndex((item) => item.id === normalized.id);
    if (index === -1) {
      tasks.value = sortTasks([normalized, ...tasks.value]);
      return;
    }

    const next = [...tasks.value];
    next.splice(index, 1, normalized);
    tasks.value = sortTasks(next);
  }

  async function loadTasks(source?: TaskSource): Promise<void> {
    const projectId = getCurrentProjectId();
    sourceFilter.value = source ?? "all";

    if (!projectId) {
      tasks.value = [];
      availableSources.value = ["local"];
      projectIntegration.value = null;
      resetDetailState();
      error.value = "当前没有选中的项目";
      return;
    }

    loading.value = true;
    error.value = null;
    resetDetailState();

    try {
      await refreshAvailableSources(projectId);
      if (sourceFilter.value !== "all" && !availableSources.value.includes(sourceFilter.value)) {
        sourceFilter.value = "local";
      }

      const nextSource = sourceFilter.value === "all" ? undefined : sourceFilter.value;
      const result = await taskApi.listTasks(projectId, nextSource);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      setTasks(result.data);
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      tasks.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createTask(input: CreateLocalTaskInput): Promise<TaskItem> {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      error.value = "当前没有选中的项目";
      throw new Error(error.value);
    }

    const result = await taskApi.createTask(projectId, input);
    if (!result.ok) {
      error.value = result.error.message;
      throw new Error(result.error.message);
    }

    error.value = null;
    upsertTask(result.data);
    return normalizeTask(result.data);
  }

  async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskItem> {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      error.value = "当前没有选中的项目";
      throw new Error(error.value);
    }

    const result = await taskApi.updateTask(projectId, taskId, updates);
    if (!result.ok) {
      error.value = result.error.message;
      throw new Error(result.error.message);
    }

    error.value = null;
    upsertTask(result.data);
    return normalizeTask(result.data);
  }

  async function deleteTask(taskId: string): Promise<void> {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      error.value = "当前没有选中的项目";
      throw new Error(error.value);
    }

    const result = await taskApi.deleteTask(projectId, taskId);
    if (!result.ok) {
      error.value = result.error.message;
      throw new Error(result.error.message);
    }

    error.value = null;
    tasks.value = tasks.value.filter((task) => task.id !== taskId);
  }

  async function loadTaskDetail(taskId: string): Promise<TaskItem> {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      detailErrorTaskId.value = taskId;
      detailErrorMessage.value = "当前没有选中的项目";
      throw new Error(detailErrorMessage.value);
    }

    detailLoadingTaskId.value = taskId;
    detailErrorTaskId.value = null;
    detailErrorMessage.value = null;

    try {
      const result = await taskApi.getTask(projectId, taskId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return normalizeTask(result.data);
    } catch (err: unknown) {
      detailErrorTaskId.value = taskId;
      detailErrorMessage.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      detailLoadingTaskId.value = null;
    }
  }

  return {
    tasks,
    loading,
    error,
    detailLoadingTaskId,
    detailErrorTaskId,
    detailErrorMessage,
    availableSources,
    sourceTabs,
    projectIntegration,
    sourceFilter,
    statusFilter,
    tasksBySource,
    filteredTasks,
    refreshAvailableSources,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    loadTaskDetail,
    resetDetailState,
  };
});
