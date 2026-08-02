import { ipcMain } from "electron";
import { AutomationTaskChannels } from "@shared/ipc/automation/task.channels";
import {
  getTaskInputSchema,
  createTaskInputSchema,
  deleteTaskInputSchema,
  listTasksInputSchema,
  updateTaskInputSchema,
} from "@shared/ipc/automation/task.schemas";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import {
  createTask as createLocalTask,
  deleteTask as deleteLocalTask,
  updateTask as updateLocalTask,
} from "@main/services/automation/task/task-service";
import {
  getTask as getAggregatedTask,
  listTasks as listAggregatedTasks,
} from "@main/services/automation/task/task-aggregator";
import { ipcError } from "../_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";

export function registerTaskHandlers(): void {
  ipcMain.handle(AutomationTaskChannels.get, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, taskId } = validate(getTaskInputSchema, input);
      const task = await getAggregatedTask(workspaceId, taskId);
      if (!task) {
        throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
      }
      return task;
    })
  );

  ipcMain.handle(AutomationTaskChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, source } = validate(listTasksInputSchema, input);
      return listAggregatedTasks(workspaceId, source);
    })
  );

  ipcMain.handle(AutomationTaskChannels.create, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createTaskInputSchema, input);
      return createLocalTask(form.workspaceId, {
        title: form.title,
        description: form.description,
      });
    })
  );

  ipcMain.handle(AutomationTaskChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(updateTaskInputSchema, input);
      return updateLocalTask(form.workspaceId, form.taskId, form.patch);
    })
  );

  ipcMain.handle(AutomationTaskChannels.delete, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, taskId } = validate(deleteTaskInputSchema, input);
      await deleteLocalTask(workspaceId, taskId);
    })
  );
}
