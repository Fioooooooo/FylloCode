import type { TaskItem } from "@shared/types/task";

export interface TaskAdapter {
  list(workspaceId: string): Promise<TaskItem[]>;
  get(taskId: string, workspaceId: string): Promise<TaskItem | null>;
}
