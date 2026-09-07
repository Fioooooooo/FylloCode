import { normalizeTaskTargetFolderIds, type TaskItem, type TaskSource } from "@shared/types/task";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { githubTaskAdapter } from "./adapters/github-task-adapter";
import { localTaskAdapter } from "./adapters/local-task-adapter";
import { yunxiaoTaskAdapter } from "./adapters/yunxiao-task-adapter";
import type { ProviderCapabilities, TaskAdapter } from "./adapters/task-adapter";

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

export function projectTaskTargets(
  task: TaskItem,
  workspaceFolderIds: readonly string[]
): TaskItem {
  const targetFolderIds = normalizeTaskTargetFolderIds(task.targetFolderIds);
  const currentIds = new Set(workspaceFolderIds);
  return {
    ...task,
    targetFolderIds: targetFolderIds.length > 0 ? targetFolderIds : undefined,
    currentTargetFolderIds: targetFolderIds.filter((folderId) => currentIds.has(folderId)),
    staleTargetFolderIds: targetFolderIds.filter((folderId) => !currentIds.has(folderId)),
  };
}

async function projectWorkspaceTargets(
  workspaceId: string,
  tasks: TaskItem[]
): Promise<TaskItem[]> {
  const workspace = await resolveWorkspace(workspaceId);
  const folderIds = workspace.folders.map((folder) => folder.folderId);
  return tasks.map((task) => projectTaskTargets(task, folderIds));
}

function adapterForTaskRef(taskRef: string): TaskAdapter {
  if (taskRef.startsWith("yunxiao:")) return yunxiaoTaskAdapter;
  if (taskRef.startsWith("github:")) return githubTaskAdapter;
  return localTaskAdapter;
}

export function getTaskCapabilities(taskRef: string): ProviderCapabilities {
  return adapterForTaskRef(taskRef).capabilities();
}

export async function listTasks(workspaceId: string, source?: TaskSource): Promise<TaskItem[]> {
  if (source === "local") {
    return projectWorkspaceTargets(workspaceId, await localTaskAdapter.list(workspaceId));
  }

  if (source === "yunxiao") {
    return projectWorkspaceTargets(workspaceId, await yunxiaoTaskAdapter.list(workspaceId));
  }

  if (source === "github") {
    return projectWorkspaceTargets(workspaceId, await githubTaskAdapter.list(workspaceId));
  }

  return projectWorkspaceTargets(
    workspaceId,
    sortTasks([
      ...(await localTaskAdapter.list(workspaceId)),
      ...(await yunxiaoTaskAdapter.list(workspaceId)),
      ...(await githubTaskAdapter.list(workspaceId)),
    ])
  );
}

export async function getTask(workspaceId: string, taskId: string): Promise<TaskItem | null> {
  const task = await adapterForTaskRef(taskId).get(taskId, workspaceId);
  return task ? (await projectWorkspaceTargets(workspaceId, [task]))[0]! : null;
}

export async function writeTaskField(
  workspaceId: string,
  taskRef: string,
  field: string,
  value: string
): Promise<void> {
  const adapter = adapterForTaskRef(taskRef);
  if (!adapter.writeField) {
    throw new Error(
      `Task provider ${adapter.capabilities().providerId} does not support field writes`
    );
  }
  await adapter.writeField(workspaceId, taskRef, field, value);
}

export async function writeTaskComment(
  workspaceId: string,
  taskRef: string,
  body: string
): Promise<void> {
  const adapter = adapterForTaskRef(taskRef);
  if (!adapter.writeComment) {
    throw new Error(`Task provider ${adapter.capabilities().providerId} does not support comments`);
  }
  await adapter.writeComment(workspaceId, taskRef, body);
}
