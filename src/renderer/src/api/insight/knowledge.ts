import type { KnowledgeEntryDocument } from "@shared/types/knowledge";
import type { IpcResponse } from "@shared/types/ipc";

export const knowledgeApi = {
  readEntry(
    projectId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return window.api.insight.knowledge.readEntry(projectId, input);
  },

  saveEntry(
    projectId: string,
    input: { name: string; content: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return window.api.insight.knowledge.saveEntry(projectId, input);
  },
};
