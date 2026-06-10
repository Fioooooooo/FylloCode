import { ipcMain } from "electron";
import { LineageChannels } from "@shared/types/channels";
import {
  createSessionTaskInputSchema,
  ensureTaskSubjectInputSchema,
  getByTaskInputSchema,
  linkTaskSessionInputSchema,
} from "@shared/schemas/ipc/lineage";
import { resolveProjectPath } from "@main/services/chat/chat-service";
import {
  createSessionTask,
  ensureTaskSubject,
  getByTask,
  linkTaskSession,
} from "@main/services/lineage/lineage-service";
import { validate } from "./_kit/schema";
import { wrapHandler } from "./_kit/wrap-handler";

export function registerLineageHandlers(): void {
  ipcMain.handle(LineageChannels.ensureTaskSubject, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(ensureTaskSubjectInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return ensureTaskSubject(projectPath, form.snapshot);
    })
  );

  ipcMain.handle(LineageChannels.linkTaskSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(linkTaskSessionInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return linkTaskSession(projectPath, form.taskRef, form.sessionId);
    })
  );

  ipcMain.handle(LineageChannels.getByTask, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getByTaskInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getByTask(projectPath, form.ref);
    })
  );

  ipcMain.handle(LineageChannels.createSessionTask, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionTaskInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return createSessionTask(projectPath, {
        sessionId: form.sessionId,
        title: form.title,
        description: form.description,
      });
    })
  );
}
