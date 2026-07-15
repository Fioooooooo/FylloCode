import type {
  KnowledgeBrowserOverview,
  KnowledgeEntryDeleteResult,
  KnowledgeEntryDocument,
} from "@shared/types/knowledge";
import type { IpcResponse } from "@shared/types/ipc";

export const knowledgeApi = {
  getBrowser(projectId: string): Promise<IpcResponse<KnowledgeBrowserOverview>> {
    return window.api.insight.knowledge.getBrowser(projectId);
  },

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

  deleteEntry(
    projectId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDeleteResult>> {
    return window.api.insight.knowledge.deleteEntry(projectId, input);
  },
};
