import type { TaskItem, TaskSource } from "@shared/types/task";
import { githubTaskAdapter } from "./adapters/github-task-adapter";
import { localTaskAdapter } from "./adapters/local-task-adapter";
import { yunxiaoTaskAdapter } from "./adapters/yunxiao-task-adapter";

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

export async function listTasks(projectId: string, source?: TaskSource): Promise<TaskItem[]> {
  if (source === "local") {
    return localTaskAdapter.list(projectId);
  }

  if (source === "yunxiao") {
    return yunxiaoTaskAdapter.list(projectId);
  }

  if (source === "github") {
    return githubTaskAdapter.list(projectId);
  }

  return sortTasks([
    ...(await localTaskAdapter.list(projectId)),
    ...(await yunxiaoTaskAdapter.list(projectId)),
    ...(await githubTaskAdapter.list(projectId)),
  ]);
}

export async function getTask(projectId: string, taskId: string): Promise<TaskItem | null> {
  if (taskId.startsWith("yunxiao:")) {
    return yunxiaoTaskAdapter.get(taskId, projectId);
  }

  if (taskId.startsWith("github:")) {
    return githubTaskAdapter.get(taskId, projectId);
  }

  return localTaskAdapter.get(taskId, projectId);
}
