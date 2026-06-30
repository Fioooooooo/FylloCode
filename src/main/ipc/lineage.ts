import { ipcMain } from "electron";
import { LineageChannels } from "@shared/types/channels";
import {
  approvePlanInputSchema,
  createSessionTaskInputSchema,
  ensureTaskSubjectInputSchema,
  getByTaskInputSchema,
  getBySessionInputSchema,
  linkTaskSessionInputSchema,
  readPlanInputSchema,
  savePlanBodyInputSchema,
} from "@shared/schemas/ipc/lineage";
import { resolveProjectPath } from "@main/services/chat/chat-service";
import {
  createSessionTask,
  ensureTaskSubject,
  getByTask,
  getBySession,
  linkTaskSession,
} from "@main/services/lineage/lineage-service";
import { approvePlan, readPlan, savePlanBody } from "@main/services/lineage/plan";
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

  ipcMain.handle(LineageChannels.getBySession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getBySessionInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getBySession(projectPath, form.sessionId);
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

  ipcMain.handle(LineageChannels.readPlan, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readPlanInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return readPlan(projectPath, form.sessionId, form.slug);
    })
  );

  ipcMain.handle(LineageChannels.savePlanBody, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(savePlanBodyInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return savePlanBody(projectPath, form.sessionId, form.slug, form.body);
    })
  );

  ipcMain.handle(LineageChannels.approvePlan, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(approvePlanInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return approvePlan(projectPath, form.sessionId, form.slug);
    })
  );
}
