import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@main/ipc/_kit/errors";
import { normalizeTaskTargetFolderIds } from "@shared/types/task";
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

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

function createLocalDescription(description?: TaskDescription): TaskDescription {
  return description ? { ...description } : { ...EMPTY_LOCAL_DESCRIPTION };
}

function applyPatch(task: TaskItem, patch: UpdateTaskInput): TaskItem {
  const normalizedTargets =
    patch.targetFolderIds === undefined
      ? task.targetFolderIds
      : normalizeTaskTargetFolderIds(patch.targetFolderIds);
  return {
    ...task,
    title: patch.title ?? task.title,
    description: patch.description ?? task.description,
    status: patch.status ?? task.status,
    labels: patch.labels ?? task.labels,
    assignee: patch.assignee ?? task.assignee,
    targetFolderIds:
      normalizedTargets && normalizedTargets.length > 0 ? normalizedTargets : undefined,
    updatedAt: new Date(),
  };
}

export async function listTasks(workspaceId: string): Promise<TaskItem[]> {
  return sortTasks(await loadTaskItems(workspaceId));
}

export async function createTask(
  workspaceId: string,
  input: CreateLocalTaskInput,
  options: CreateTaskOptions = {}
): Promise<TaskItem> {
  // Fast read-only duplicate check: if a task with the same actionId already exists,
  // return it immediately without generating a new id. The atomic update below still
  // guards against duplicates that appear between this check and the write.
  if (options.actionId) {
    const currentTasks = await loadTaskItems(workspaceId);
    const existing = currentTasks.find((task) => task.actionId === options.actionId);
    if (existing) {
      return existing;
    }
  }

  const now = new Date();
  const task: TaskItem = {
    id: newTaskId(),
    workspaceId,
    title: input.title,
    description: createLocalDescription(input.description),
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    assignee: undefined,
    originSessionId: options.originSessionId,
    actionId: options.actionId,
    targetFolderIds: (() => {
      const targets = normalizeTaskTargetFolderIds(input.targetFolderIds);
      return targets.length > 0 ? targets : undefined;
    })(),
    currentTargetFolderIds: [],
    staleTargetFolderIds: [],
    createdAt: now,
    updatedAt: now,
  };

  const nextTasks = await updateTaskItems(workspaceId, (current) => {
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
  workspaceId: string,
  taskId: string,
  patch: UpdateTaskInput
): Promise<TaskItem> {
  let nextTask: TaskItem | undefined;

  await updateTaskItems(workspaceId, (current) => {
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

export async function deleteTask(workspaceId: string, taskId: string): Promise<void> {
  await updateTaskItems(workspaceId, (current) => {
    const nextTasks = current.filter((task) => task.id !== taskId);
    if (nextTasks.length === current.length) {
      throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
    }
    return nextTasks;
  });
}
