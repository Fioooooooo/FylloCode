import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@main/ipc/_kit/errors";
import { loadProject } from "@main/infra/storage/project-store";
import type { TaskItem } from "@shared/types/task";
import type { TaskAdapter } from "./task-adapter";
import { listTasks } from "@main/services/task/task-service";

async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }

  return project.path;
}

export class LocalTaskAdapter implements TaskAdapter {
  async list(projectId: string): Promise<TaskItem[]> {
    const projectPath = await resolveProjectPath(projectId);
    return listTasks(projectPath);
  }

  async get(taskId: string, projectId: string): Promise<TaskItem | null> {
    const tasks = await this.list(projectId);
    return tasks.find((task) => task.id === taskId) ?? null;
  }
}

export const localTaskAdapter = new LocalTaskAdapter();
