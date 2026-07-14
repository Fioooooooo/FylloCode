import { IpcErrorCodes } from "@shared/constants/error-codes";
import { encodeProjectPath } from "@main/infra/storage/project-paths";
import { loadProject } from "@main/infra/storage/project-store";
import { ipcError } from "@main/ipc/_kit/errors";
import type {
  CreateLocalTaskInput,
  TaskDescription,
  TaskItem,
  UpdateTaskInput,
} from "@shared/types/task";
import {
  loadTasks as loadTaskItems,
  updateTasks as updateTaskItems,
} from "@main/infra/storage/task-store";
import { newTaskId } from "@main/infra/ids";

const EMPTY_LOCAL_DESCRIPTION: TaskDescription = {
  format: "plain_text",
  content: "",
};

interface CreateTaskOptions {
  originSessionId?: string;
  actionId?: string;
}

export async function resolveTaskProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }

  return project.path;
}

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

function createLocalDescription(description?: TaskDescription): TaskDescription {
  return description ? { ...description } : { ...EMPTY_LOCAL_DESCRIPTION };
}

function applyPatch(task: TaskItem, patch: UpdateTaskInput): TaskItem {
  return {
    ...task,
    title: patch.title ?? task.title,
    description: patch.description ?? task.description,
    status: patch.status ?? task.status,
    labels: patch.labels ?? task.labels,
    assignee: patch.assignee ?? task.assignee,
    updatedAt: new Date(),
  };
}

export async function listTasks(projectPath: string): Promise<TaskItem[]> {
  return sortTasks(await loadTaskItems(projectPath));
}

export async function createTask(
  projectPath: string,
  input: CreateLocalTaskInput,
  options: CreateTaskOptions = {}
): Promise<TaskItem> {
  // Fast read-only duplicate check: if a task with the same actionId already exists,
  // return it immediately without generating a new id. The atomic update below still
  // guards against duplicates that appear between this check and the write.
  if (options.actionId) {
    const currentTasks = await loadTaskItems(projectPath);
    const existing = currentTasks.find((task) => task.actionId === options.actionId);
    if (existing) {
      return existing;
    }
  }

  const now = new Date();
  const projectId = encodeProjectPath(projectPath);
  const task: TaskItem = {
    id: newTaskId(),
    projectId,
    title: input.title,
    description: createLocalDescription(input.description),
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    assignee: undefined,
    originSessionId: options.originSessionId,
    actionId: options.actionId,
    createdAt: now,
    updatedAt: now,
  };

  const nextTasks = await updateTaskItems(projectPath, (current) => {
    if (options.actionId) {
      const existing = current.find((item) => item.actionId === options.actionId);
      if (existing) {
        return current;
      }
    }
    return [...current, task];
  });

  if (options.actionId) {
    const existing = nextTasks.find(
      (item) => item.actionId === options.actionId && item.id !== task.id
    );
    if (existing) {
      return existing;
    }
  }

  return task;
}

export async function updateTask(
  projectPath: string,
  taskId: string,
  patch: UpdateTaskInput
): Promise<TaskItem> {
  let nextTask: TaskItem | undefined;

  await updateTaskItems(projectPath, (current) => {
    const index = current.findIndex((task) => task.id === taskId);
    if (index === -1) {
      throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
    }

    nextTask = applyPatch(current[index], patch);
    const nextTasks = [...current];
    nextTasks.splice(index, 1, nextTask);
    return nextTasks;
  });

  return nextTask!;
}

export async function deleteTask(projectPath: string, taskId: string): Promise<void> {
  await updateTaskItems(projectPath, (current) => {
    const nextTasks = current.filter((task) => task.id !== taskId);
    if (nextTasks.length === current.length) {
      throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
    }
    return nextTasks;
  });
}
