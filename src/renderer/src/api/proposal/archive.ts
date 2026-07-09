import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ArchiveRunMeta } from "@shared/types/proposal";
import type { UIMessage } from "ai";

export const proposalArchiveApi = {
  archive(
    input: {
      projectId: string;
      changeId: string;
    },
    callbacks: Parameters<typeof window.api.proposal.archive.archive>[1]
  ): () => void {
    return window.api.proposal.archive.archive(input, callbacks);
  },

  loadArchive(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<ArchiveRunMeta | null>> {
    return window.api.proposal.archive.loadArchive(input);
  },

  loadArchiveMessages(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return window.api.proposal.archive.loadArchiveMessages(input);
  },
};
