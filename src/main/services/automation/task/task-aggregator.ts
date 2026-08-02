import { normalizeTaskTargetFolderIds, type TaskItem, type TaskSource } from "@shared/types/task";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { githubTaskAdapter } from "./adapters/github-task-adapter";
import { localTaskAdapter } from "./adapters/local-task-adapter";
import { yunxiaoTaskAdapter } from "./adapters/yunxiao-task-adapter";

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
  if (taskId.startsWith("yunxiao:")) {
    const task = await yunxiaoTaskAdapter.get(taskId, workspaceId);
    return task ? (await projectWorkspaceTargets(workspaceId, [task]))[0]! : null;
  }

  if (taskId.startsWith("github:")) {
    const task = await githubTaskAdapter.get(taskId, workspaceId);
    return task ? (await projectWorkspaceTargets(workspaceId, [task]))[0]! : null;
  }

  const task = await localTaskAdapter.get(taskId, workspaceId);
  return task ? (await projectWorkspaceTargets(workspaceId, [task]))[0]! : null;
}
