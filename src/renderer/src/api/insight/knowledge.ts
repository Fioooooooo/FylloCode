import type {
  KnowledgeBrowserOverview,
  KnowledgeEntryDeleteResult,
  KnowledgeEntryDocument,
} from "@shared/types/knowledge";
import type { IpcResponse } from "@shared/types/ipc";

export const knowledgeApi = {
  getBrowser(workspaceId: string): Promise<IpcResponse<KnowledgeBrowserOverview>> {
    return window.api.insight.knowledge.getBrowser(workspaceId);
  },

  readEntry(
    workspaceId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return window.api.insight.knowledge.readEntry(workspaceId, input);
  },

  saveEntry(
    workspaceId: string,
    input: { name: string; content: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return window.api.insight.knowledge.saveEntry(workspaceId, input);
  },

  deleteEntry(
    workspaceId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDeleteResult>> {
    return window.api.insight.knowledge.deleteEntry(workspaceId, input);
  },
};
