import { ipcMain } from "electron";
import { InsightLineageChannels } from "@shared/ipc/insight/lineage.channels";
import {
  approvePlanInputSchema,
  createSessionTaskInputSchema,
  ensureTaskSubjectInputSchema,
  getBrowserInputSchema,
  getByTaskInputSchema,
  getBySessionInputSchema,
  linkTaskSessionInputSchema,
  readPlanInputSchema,
  savePlanBodyInputSchema,
} from "@shared/ipc/insight/lineage.schemas";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import {
  createSessionTask,
  ensureTaskSubject,
  getByTask,
  getBySession,
  linkTaskSession,
} from "@main/services/insight/lineage/lineage-service";
import { getLineageBrowser } from "@main/services/insight/lineage/browser";
import { approvePlan, readPlan, savePlanBody } from "@main/services/insight/lineage/plan";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerLineageHandlers(): void {
  ipcMain.handle(InsightLineageChannels.ensureTaskSubject, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(ensureTaskSubjectInputSchema, input);
      return ensureTaskSubject(form.workspaceId, form.snapshot);
    })
  );

  ipcMain.handle(InsightLineageChannels.linkTaskSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(linkTaskSessionInputSchema, input);
      return linkTaskSession(form.workspaceId, form.taskRef, form.sessionId);
    })
  );

  ipcMain.handle(InsightLineageChannels.getByTask, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getByTaskInputSchema, input);
      return getByTask(form.workspaceId, form.ref);
    })
  );

  ipcMain.handle(InsightLineageChannels.getBySession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getBySessionInputSchema, input);
      return getBySession(form.workspaceId, form.sessionId);
    })
  );

  ipcMain.handle(InsightLineageChannels.getBrowser, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getBrowserInputSchema, input);
      const workspace = await getRequiredWorkspaceInfo(form.workspaceId);
      return getLineageBrowser(
        form.workspaceId,
        workspace.availableFolders.map(({ folderId, folderPath }) => ({ folderId, folderPath }))
      );
    })
  );

  ipcMain.handle(InsightLineageChannels.createSessionTask, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionTaskInputSchema, input);
      return createSessionTask(form.workspaceId, {
        sessionId: form.sessionId,
        title: form.title,
        description: form.description,
        actionId: form.actionId,
      });
    })
  );

  ipcMain.handle(InsightLineageChannels.readPlan, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readPlanInputSchema, input);
      return readPlan(form.workspaceId, form.sessionId, form.slug);
    })
  );

  ipcMain.handle(InsightLineageChannels.savePlanBody, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(savePlanBodyInputSchema, input);
      return savePlanBody(form.workspaceId, form.sessionId, form.slug, form.body);
    })
  );

  ipcMain.handle(InsightLineageChannels.approvePlan, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(approvePlanInputSchema, input);
      return approvePlan(form.workspaceId, form.sessionId, form.slug);
    })
  );
}
