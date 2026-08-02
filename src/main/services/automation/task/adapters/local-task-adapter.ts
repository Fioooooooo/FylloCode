import type { TaskItem } from "@shared/types/task";
import type { TaskAdapter } from "./task-adapter";
import { listTasks } from "@main/services/automation/task/task-service";

export class LocalTaskAdapter implements TaskAdapter {
  async list(workspaceId: string): Promise<TaskItem[]> {
    return listTasks(workspaceId);
  }

  async get(taskId: string, workspaceId: string): Promise<TaskItem | null> {
    const tasks = await this.list(workspaceId);
    return tasks.find((task) => task.id === taskId) ?? null;
  }
}

export const localTaskAdapter = new LocalTaskAdapter();
