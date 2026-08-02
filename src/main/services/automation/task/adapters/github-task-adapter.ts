import type { TaskItem } from "@shared/types/task";
import type { TaskAdapter } from "./task-adapter";

export class GithubTaskAdapter implements TaskAdapter {
  async list(workspaceId: string): Promise<TaskItem[]> {
    void workspaceId;
    return [];
  }

  async get(taskId: string, workspaceId: string): Promise<TaskItem | null> {
    void taskId;
    void workspaceId;
    return null;
  }
}

export const githubTaskAdapter = new GithubTaskAdapter();
