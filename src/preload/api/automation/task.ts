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
  getTask(workspaceId: string, taskId: string): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(AutomationTaskChannels.get, { workspaceId, taskId });
  },

  listTasks(workspaceId: string, source?: TaskSource): Promise<IpcResponse<TaskItem[]>> {
    return ipcRenderer.invoke(AutomationTaskChannels.list, { workspaceId, source });
  },

  createTask(workspaceId: string, input: CreateLocalTaskInput): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(AutomationTaskChannels.create, { workspaceId, ...input });
  },

  updateTask(
    workspaceId: string,
    taskId: string,
    updates: UpdateTaskInput
  ): Promise<IpcResponse<TaskItem>> {
    return ipcRenderer.invoke(AutomationTaskChannels.update, {
      workspaceId,
      taskId,
      patch: updates,
    });
  },

  deleteTask(workspaceId: string, taskId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AutomationTaskChannels.delete, { workspaceId, taskId });
  },
};
