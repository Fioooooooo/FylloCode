import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  UpdateTaskInput,
} from "@shared/types/task";

export const taskApi = {
  getTask(workspaceId: string, taskId: string): Promise<IpcResponse<TaskItem>> {
    return window.api.automation.task.getTask(workspaceId, taskId);
  },

  listTasks(workspaceId: string, source?: TaskSource): Promise<IpcResponse<TaskItem[]>> {
    return window.api.automation.task.listTasks(workspaceId, source);
  },

  createTask(workspaceId: string, input: CreateLocalTaskInput): Promise<IpcResponse<TaskItem>> {
    return window.api.automation.task.createTask(workspaceId, input);
  },

  updateTask(
    workspaceId: string,
    taskId: string,
    updates: UpdateTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return window.api.automation.task.updateTask(workspaceId, taskId, updates);
  },

  deleteTask(workspaceId: string, taskId: string): Promise<IpcResponse<void>> {
    return window.api.automation.task.deleteTask(workspaceId, taskId);
  },
};
