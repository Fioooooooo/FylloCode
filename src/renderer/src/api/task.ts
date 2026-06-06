import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  UpdateTaskInput,
} from "@shared/types/task";

export const taskApi = {
  getTask(projectId: string, taskId: string): Promise<IpcResponse<TaskItem>> {
    return window.api.task.getTask(projectId, taskId);
  },

  listTasks(projectId: string, source?: TaskSource): Promise<IpcResponse<TaskItem[]>> {
    return window.api.task.listTasks(projectId, source);
  },

  createTask(projectId: string, input: CreateLocalTaskInput): Promise<IpcResponse<TaskItem>> {
    return window.api.task.createTask(projectId, input);
  },

  updateTask(
    projectId: string,
    taskId: string,
    updates: UpdateTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return window.api.task.updateTask(projectId, taskId, updates);
  },

  deleteTask(projectId: string, taskId: string): Promise<IpcResponse<void>> {
    return window.api.task.deleteTask(projectId, taskId);
  },
};
