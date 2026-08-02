import type { TaskItem, TaskSource } from "@shared/types/task";
import { githubTaskAdapter } from "./adapters/github-task-adapter";
import { localTaskAdapter } from "./adapters/local-task-adapter";
import { yunxiaoTaskAdapter } from "./adapters/yunxiao-task-adapter";

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

export async function listTasks(workspaceId: string, source?: TaskSource): Promise<TaskItem[]> {
  if (source === "local") {
    return localTaskAdapter.list(workspaceId);
  }

  if (source === "yunxiao") {
    return yunxiaoTaskAdapter.list(workspaceId);
  }

  if (source === "github") {
    return githubTaskAdapter.list(workspaceId);
  }

  return sortTasks([
    ...(await localTaskAdapter.list(workspaceId)),
    ...(await yunxiaoTaskAdapter.list(workspaceId)),
    ...(await githubTaskAdapter.list(workspaceId)),
  ]);
}

export async function getTask(workspaceId: string, taskId: string): Promise<TaskItem | null> {
  if (taskId.startsWith("yunxiao:")) {
    return yunxiaoTaskAdapter.get(taskId, workspaceId);
  }

  if (taskId.startsWith("github:")) {
    return githubTaskAdapter.get(taskId, workspaceId);
  }

  return localTaskAdapter.get(taskId, workspaceId);
}
