import { ipcRenderer } from "electron";
import { ProposalArchiveChannels } from "@shared/ipc/proposal/archive.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ArchiveRunMeta } from "@shared/types/proposal";
import type { UIMessage } from "ai";
import { startProposalStream, type StreamCallbacks } from "./stream";

export const proposalArchiveApi = {
  archive(
    input: {
      projectId: string;
      changeId: string;
    },
    callbacks: StreamCallbacks
  ): () => void {
    return startProposalStream(
      ProposalArchiveChannels.archive,
      ProposalArchiveChannels.archivePort,
      input,
      callbacks,
      () => {
        void ipcRenderer.invoke(ProposalArchiveChannels.archiveCancel, input);
      }
    );
  },

  loadArchive(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<ArchiveRunMeta | null>> {
    return ipcRenderer.invoke(ProposalArchiveChannels.loadArchive, input);
  },

  loadArchiveMessages(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return ipcRenderer.invoke(ProposalArchiveChannels.loadArchiveMessages, input);
  },
};
