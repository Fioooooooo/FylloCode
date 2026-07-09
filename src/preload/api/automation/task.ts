import { ipcRenderer } from "electron";
import { AutomationTaskChannels } from "@shared/ipc/automation/task.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  UpdateTaskInput,
} from "@shared/types/task";

export const taskApi = {
  getTask(projectId: string, taskId: string): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(AutomationTaskChannels.get, { projectId, taskId });
  },

  listTasks(projectId: string, source?: TaskSource): Promise<IpcResponse<TaskItem[]>> {
    return ipcRenderer.invoke(AutomationTaskChannels.list, { projectId, source });
  },

  createTask(projectId: string, input: CreateLocalTaskInput): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(AutomationTaskChannels.create, { projectId, ...input });
  },

  updateTask(
    projectId: string,
    taskId: string,
    updates: UpdateTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(AutomationTaskChannels.update, { projectId, taskId, patch: updates });
  },

  deleteTask(projectId: string, taskId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AutomationTaskChannels.delete, { projectId, taskId });
  },
};
