import { ipcMain } from "electron";
import { InsightKnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import {
  readKnowledgeEntryInputSchema,
  saveKnowledgeEntryInputSchema,
} from "@shared/ipc/insight/knowledge.schemas";
import { resolveProjectPath } from "@main/services/session/chat/chat-service";
import {
  readKnowledgeEntry,
  saveKnowledgeEntry,
} from "@main/services/insight/knowledge/knowledge-document-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerKnowledgeHandlers(): void {
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
}
