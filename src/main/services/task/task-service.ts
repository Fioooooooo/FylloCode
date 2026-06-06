import { generateId } from "ai";
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
  saveTasks as saveTaskItems,
} from "@main/infra/storage/task-store";

const EMPTY_LOCAL_DESCRIPTION: TaskDescription = {
  format: "plain_text",
  content: "",
};

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
    proposalId: patch.proposalId ?? task.proposalId,
    updatedAt: new Date(),
  };
}

export async function listTasks(projectPath: string): Promise<TaskItem[]> {
  return sortTasks(await loadTaskItems(projectPath));
}

export async function createTask(
  projectPath: string,
  input: CreateLocalTaskInput
): Promise<TaskItem> {
  const currentTasks = await loadTaskItems(projectPath);
  const now = new Date();
  const projectId = encodeProjectPath(projectPath);
  const task: TaskItem = {
    id: generateId(),
    projectId,
    title: input.title,
    description: createLocalDescription(input.description),
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    assignee: undefined,
    proposalId: input.proposalId,
    createdAt: now,
    updatedAt: now,
  };

  await saveTaskItems(projectPath, [...currentTasks, task]);
  return task;
}

export async function updateTask(
  projectPath: string,
  taskId: string,
  patch: UpdateTaskInput
): Promise<TaskItem> {
  const currentTasks = await loadTaskItems(projectPath);
  const index = currentTasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
  }

  const nextTask = applyPatch(currentTasks[index], patch);
  const nextTasks = [...currentTasks];
  nextTasks.splice(index, 1, nextTask);
  await saveTaskItems(projectPath, nextTasks);
  return nextTask;
}

export async function deleteTask(projectPath: string, taskId: string): Promise<void> {
  const currentTasks = await loadTaskItems(projectPath);
  const nextTasks = currentTasks.filter((task) => task.id !== taskId);
  if (nextTasks.length === currentTasks.length) {
    throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
  }

  await saveTaskItems(projectPath, nextTasks);
}
