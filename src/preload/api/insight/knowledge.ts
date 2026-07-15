import { ipcRenderer } from "electron";
import { InsightKnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import type {
  KnowledgeBrowserOverview,
  KnowledgeEntryDeleteResult,
  KnowledgeEntryDocument,
} from "@shared/types/knowledge";
import type { IpcResponse } from "@shared/types/ipc";

export const knowledgeApi = {
  getBrowser(projectId: string): Promise<IpcResponse<KnowledgeBrowserOverview>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.getBrowser, { projectId });
  },

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

  deleteEntry(
    projectId: string,
    input: { name: string }
  ): Promise<IpcResponse<KnowledgeEntryDeleteResult>> {
    return ipcRenderer.invoke(InsightKnowledgeChannels.deleteEntry, {
      projectId,
      ...input,
    });
  },
};
