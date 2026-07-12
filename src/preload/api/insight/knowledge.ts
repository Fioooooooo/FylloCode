import { ipcRenderer } from "electron";
import { InsightKnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import type { KnowledgeEntryDocument } from "@shared/types/knowledge";
import type { IpcResponse } from "@shared/types/ipc";

export const knowledgeApi = {
  readEntry(
    projectId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.readEntry, {
      projectId,
      ...input,
    });
  },

  saveEntry(
    projectId: string,
    input: { name: string; content: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.saveEntry, {
      projectId,
      ...input,
    });
  },
};
