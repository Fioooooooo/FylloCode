import { ipcMain } from "electron";
import { InsightKnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import {
  deleteKnowledgeEntryInputSchema,
  getKnowledgeBrowserInputSchema,
  readKnowledgeEntryInputSchema,
  saveKnowledgeEntryInputSchema,
} from "@shared/ipc/insight/knowledge.schemas";
import { resolveProjectPath } from "@main/services/session/chat/chat-service";
import {
  deleteKnowledgeEntry,
  getKnowledgeBrowser,
  readKnowledgeEntry,
  saveKnowledgeEntry,
} from "@main/services/insight/knowledge/knowledge-document-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerKnowledgeHandlers(): void {
  ipcMain.handle(InsightKnowledgeChannels.getBrowser, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getKnowledgeBrowserInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return getKnowledgeBrowser(projectPath);
    })
  );

  ipcMain.handle(InsightKnowledgeChannels.readEntry, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readKnowledgeEntryInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return readKnowledgeEntry(projectPath, form.name);
    })
  );

  ipcMain.handle(InsightKnowledgeChannels.saveEntry, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(saveKnowledgeEntryInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return saveKnowledgeEntry(projectPath, {
        name: form.name,
        content: form.content,
      });
    })
  );

  ipcMain.handle(InsightKnowledgeChannels.deleteEntry, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(deleteKnowledgeEntryInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return deleteKnowledgeEntry(projectPath, form.name);
    })
  );
}
