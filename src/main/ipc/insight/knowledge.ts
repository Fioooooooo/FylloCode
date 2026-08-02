import { ipcMain } from "electron";
import { InsightKnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import {
  deleteKnowledgeEntryInputSchema,
  getKnowledgeBrowserInputSchema,
  readKnowledgeEntryInputSchema,
  saveKnowledgeEntryInputSchema,
} from "@shared/ipc/insight/knowledge.schemas";
import {
  deleteKnowledgeEntry,
  getKnowledgeBrowser,
  readKnowledgeEntry,
  saveKnowledgeEntry,
} from "@main/services/insight/knowledge/knowledge-document-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";

export function registerKnowledgeHandlers(): void {
  ipcMain.handle(InsightKnowledgeChannels.getBrowser, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(getKnowledgeBrowserInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      const workspace = await getRequiredWorkspaceInfo(form.workspaceId);
      return getKnowledgeBrowser(
        form.workspaceId,
        workspace.availableFolders.map(({ folderId, folderPath }) => ({ folderId, folderPath }))
      );
    })
  );

  ipcMain.handle(InsightKnowledgeChannels.readEntry, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readKnowledgeEntryInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      return readKnowledgeEntry(form.workspaceId, form.name);
    })
  );

  ipcMain.handle(InsightKnowledgeChannels.saveEntry, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(saveKnowledgeEntryInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      return saveKnowledgeEntry(form.workspaceId, {
        name: form.name,
        content: form.content,
      });
    })
  );

  ipcMain.handle(InsightKnowledgeChannels.deleteEntry, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(deleteKnowledgeEntryInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      return deleteKnowledgeEntry(form.workspaceId, form.name);
    })
  );
}
