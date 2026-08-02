import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { taskApi } from "@renderer/api/automation/task";
import { projectIntegrationApi } from "@renderer/api/automation/project-integration";
import { useChatStore } from "../session/chat";
import { useLineageStore } from "../insight/lineage";
import { useWorkspaceStore } from "../workspace/workspace";
import { useSessionStore } from "../session/session";
import { buildSourceDisplay, getTaskDescriptionPlainText } from "@renderer/utils/task";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  TaskStatus,
  UpdateTaskInput,
} from "@shared/types/task";
import type {
  LineageSessionLink,
  LineageTaskRef,
  LineageTaskSnapshot,
  Subject,
  TaskDownstreamProjection,
} from "@shared/types/lineage";
import type {
  WorkspaceIntegrationConfig,
  WorkspaceIntegrationEntry,
} from "@shared/types/integration";

type TaskSourceFilter = TaskSource | "all";
type TaskSourceTab = { label: string; value: TaskSource };

export interface TaskLinkedSessionEntry {
  sessionId: string;
  title: string;
  updatedAt?: Date;
  createdAt?: Date;
  status?: "running" | "ended";
}

const baseSourceTabs: TaskSourceTab[] = [{ label: "本地", value: "local" }];

function isMountedYunxiaoProjexProject(entry: WorkspaceIntegrationEntry): boolean {
  return entry.providerId === "yunxiao" && entry.resourceType === "projex-project";
}

function hasYunxiaoTaskSource(config: WorkspaceIntegrationConfig | null): boolean {
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
  const projectIntegration = ref<WorkspaceIntegrationConfig | null>(null);
  let tasksLoadGeneration = 0;

  // 动态 tab：local 始终存在；当项目接入 yunxiao projex 项目后追加云效 tab。
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

  function getCurrentWorkspaceId(): string | undefined {
    return useWorkspaceStore().currentWorkspace?.id;
  }

  function buildTaskRef(task: TaskItem): LineageTaskRef {
    return `${task.source}:${task.id}` as LineageTaskRef;
  }

  // 把任务信息格式化为发给 agent 的第一条用户消息文本。
  function buildTaskPrompt(task: TaskItem): string {
    const sourceDisplay = buildSourceDisplay(task);
    const descriptionText = getTaskDescriptionPlainText(task.description);
    const url =
      task.source !== "local" && "url" in task.sourceMeta && task.sourceMeta.url
        ? ` (${task.sourceMeta.url})`
        : "";

    const sections = [`**来源**: ${sourceDisplay}${url}`, `**标题**: ${task.title}`];

    if (descriptionText) {
      sections.push("", "**描述**:", descriptionText);
    }

    sections.push("", "请帮我规划这个任务的方案");

    return sections.join("\n");
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

  async function refreshAvailableSources(workspaceId?: string): Promise<void> {
    if (!workspaceId) {
      projectIntegration.value = null;
      availableSources.value = ["local"];
      if (sourceFilter.value !== "all") {
        sourceFilter.value = "local";
      }
      return;
    }

    const result = await projectIntegrationApi.getProjectIntegration(workspaceId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (useWorkspaceStore().currentWorkspace?.id !== workspaceId) {
      return;
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
    const workspaceId = getCurrentWorkspaceId();
    const requestGeneration = ++tasksLoadGeneration;
    sourceFilter.value = source ?? "all";

    if (!workspaceId) {
      tasks.value = [];
      availableSources.value = ["local"];
      projectIntegration.value = null;
      resetDetailState();
      loading.value = false;
      error.value = "当前没有选中的工作区";
      return;
    }

    loading.value = true;
    error.value = null;
    resetDetailState();

    try {
      await refreshAvailableSources(workspaceId);
      if (
        requestGeneration !== tasksLoadGeneration ||
        useWorkspaceStore().currentWorkspace?.id !== workspaceId
      ) {
        return;
      }
      if (sourceFilter.value !== "all" && !availableSources.value.includes(sourceFilter.value)) {
        sourceFilter.value = "local";
      }

      const nextSource = sourceFilter.value === "all" ? undefined : sourceFilter.value;
      const result = await taskApi.listTasks(workspaceId, nextSource);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      if (
        requestGeneration !== tasksLoadGeneration ||
        useWorkspaceStore().currentWorkspace?.id !== workspaceId
      ) {
        return;
      }

      setTasks(result.data);
    } catch (err: unknown) {
      if (
        requestGeneration === tasksLoadGeneration &&
        useWorkspaceStore().currentWorkspace?.id === workspaceId
      ) {
        error.value = err instanceof Error ? err.message : String(err);
        tasks.value = [];
      }
    } finally {
      if (
        requestGeneration === tasksLoadGeneration &&
        useWorkspaceStore().currentWorkspace?.id === workspaceId
      ) {
        loading.value = false;
      }
    }
  }

  async function createTask(input: CreateLocalTaskInput): Promise<TaskItem> {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) {
      error.value = "当前没有选中的工作区";
      throw new Error(error.value);
    }

    const result = await taskApi.createTask(workspaceId, input);
    if (!result.ok) {
      error.value = result.error.message;
      throw new Error(result.error.message);
    }

    error.value = null;
    upsertTask(result.data);
    return normalizeTask(result.data);
  }

  async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskItem> {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) {
      error.value = "当前没有选中的工作区";
      throw new Error(error.value);
    }

    const result = await taskApi.updateTask(workspaceId, taskId, updates);
    if (!result.ok) {
      error.value = result.error.message;
      throw new Error(result.error.message);
    }

    error.value = null;
    upsertTask(result.data);
    return normalizeTask(result.data);
  }

  async function deleteTask(taskId: string): Promise<void> {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) {
      error.value = "当前没有选中的工作区";
      throw new Error(error.value);
    }

    const result = await taskApi.deleteTask(workspaceId, taskId);
    if (!result.ok) {
      error.value = result.error.message;
      throw new Error(result.error.message);
    }

    error.value = null;
    tasks.value = tasks.value.filter((task) => task.id !== taskId);
  }

  async function loadTaskDetail(taskId: string): Promise<TaskItem> {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) {
      detailErrorTaskId.value = taskId;
      detailErrorMessage.value = "当前没有选中的工作区";
      throw new Error(detailErrorMessage.value);
    }

    detailLoadingTaskId.value = taskId;
    detailErrorTaskId.value = null;
    detailErrorMessage.value = null;

    try {
      const result = await taskApi.getTask(workspaceId, taskId);
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

  function ensureTaskSubject(
    workspaceId: string,
    snapshot: LineageTaskSnapshot
  ): Promise<IpcResponse<Subject>> {
    return useLineageStore().ensureTaskSubject(workspaceId, snapshot);
  }

  function getTaskLineage(
    workspaceId: string,
    ref: LineageTaskRef
  ): Promise<IpcResponse<TaskDownstreamProjection | null>> {
    return useLineageStore().getByTask(workspaceId, ref);
  }

  async function startDiscussionFromTask(task: TaskItem): Promise<void> {
    const workspaceId = getCurrentWorkspaceId();
    if (!workspaceId) {
      return;
    }

    const taskRef = buildTaskRef(task);
    const snapshot: LineageTaskSnapshot = {
      ref: taskRef,
      snapshot: JSON.parse(JSON.stringify(task)) as TaskItem,
      capturedAt: new Date().toISOString(),
    };

    const result = await ensureTaskSubject(workspaceId, snapshot);
    if (!result.ok) {
      throw new Error(result.error.message || result.error.code);
    }

    if (useWorkspaceStore().currentWorkspace?.id !== workspaceId) {
      return;
    }

    useSessionStore().beginDraftSession();
    await useChatStore().sendMessage([{ type: "text", text: buildTaskPrompt(task) }], { taskRef });
  }

  function getLinkedSessionEntries(links: LineageSessionLink[]): TaskLinkedSessionEntry[] {
    const sessions = useSessionStore().sessions;

    return links.map((link) => {
      const session = sessions.find((item) => item.id === link.sessionId);
      if (session) {
        return {
          sessionId: link.sessionId,
          title: session.title,
          updatedAt: session.updatedAt,
          status: session.status,
        };
      }

      return {
        sessionId: link.sessionId,
        title: link.sessionId,
        createdAt: new Date(link.createdAt),
      };
    });
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
    buildTaskRef,
    ensureTaskSubject,
    getTaskLineage,
    startDiscussionFromTask,
    getLinkedSessionEntries,
    resetDetailState,
  };
});
