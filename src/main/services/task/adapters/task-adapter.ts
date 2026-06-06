import type { TaskItem } from "@shared/types/task";

export interface TaskAdapter {
  list(projectId: string): Promise<TaskItem[]>;
  get(taskId: string, projectId: string): Promise<TaskItem | null>;
}
