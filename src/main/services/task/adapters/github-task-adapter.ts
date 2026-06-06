import type { TaskItem } from "@shared/types/task";
import type { TaskAdapter } from "./task-adapter";

export class GithubTaskAdapter implements TaskAdapter {
  async list(projectId: string): Promise<TaskItem[]> {
    void projectId;
    return [];
  }

  async get(taskId: string, projectId: string): Promise<TaskItem | null> {
    void taskId;
    void projectId;
    return null;
  }
}

export const githubTaskAdapter = new GithubTaskAdapter();
