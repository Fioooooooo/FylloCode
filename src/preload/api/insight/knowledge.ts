import { ipcRenderer } from "electron";
import { InsightKnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import type {
  KnowledgeBrowserOverview,
  KnowledgeEntryDeleteResult,
  KnowledgeEntryDocument,
} from "@shared/types/knowledge";
import type { IpcResponse } from "@shared/types/ipc";

export const knowledgeApi = {
  getBrowser(workspaceId: string): Promise<IpcResponse<KnowledgeBrowserOverview>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.getBrowser, { workspaceId });
  },

  readEntry(
    workspaceId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.readEntry, {
      workspaceId,
      ...input,
    });
  },

  saveEntry(
    workspaceId: string,
    input: { name: string; content: string }
  ): Promise<IpcResponse<KnowledgeEntryDocument>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.saveEntry, {
      workspaceId,
      ...input,
    });
  },

  deleteEntry(
    workspaceId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDeleteResult>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.deleteEntry, {
      workspaceId,
      ...input,
    });
  },
};
