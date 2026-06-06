import { ipcMain } from "electron";
import { TaskChannels } from "@shared/types/channels";
import {
  getTaskInputSchema,
  createTaskInputSchema,
  deleteTaskInputSchema,
  listTasksInputSchema,
  updateTaskInputSchema,
} from "@shared/schemas/ipc/task";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  createTask as createLocalTask,
  deleteTask as deleteLocalTask,
  resolveTaskProjectPath,
  updateTask as updateLocalTask,
} from "@main/services/task/task-service";
import {
  getTask as getAggregatedTask,
  listTasks as listAggregatedTasks,
} from "@main/services/task/task-aggregator";
import { ipcError } from "./_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";

export function registerTaskHandlers(): void {
  ipcMain.handle(TaskChannels.get, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, taskId } = validate(getTaskInputSchema, input);
      const task = await getAggregatedTask(projectId, taskId);
      if (!task) {
        throw ipcError(IpcErrorCodes.TASK_NOT_FOUND, `Task not found: ${taskId}`);
      }
      return task;
    })
  );

  ipcMain.handle(TaskChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, source } = validate(listTasksInputSchema, input);
      return listAggregatedTasks(projectId, source);
    })
  );

  ipcMain.handle(TaskChannels.create, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createTaskInputSchema, input);
      const projectPath = await resolveTaskProjectPath(form.projectId);
      return createLocalTask(projectPath, {
        title: form.title,
        description: form.description,
        proposalId: form.proposalId,
      });
    })
  );

  ipcMain.handle(TaskChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(updateTaskInputSchema, input);
      const projectPath = await resolveTaskProjectPath(form.projectId);
      return updateLocalTask(projectPath, form.taskId, form.patch);
    })
  );

  ipcMain.handle(TaskChannels.delete, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, taskId } = validate(deleteTaskInputSchema, input);
      const projectPath = await resolveTaskProjectPath(projectId);
      await deleteLocalTask(projectPath, taskId);
    })
  );
}
