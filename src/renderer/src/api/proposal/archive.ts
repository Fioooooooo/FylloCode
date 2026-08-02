import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ArchiveRunMeta, ProposalRef } from "@shared/types/proposal";
import type { UIMessage } from "ai";

export const proposalArchiveApi = {
  archive(
    input: { workspaceId: string } & ProposalRef,
    callbacks: Parameters<typeof window.api.proposal.archive.archive>[1]
  ): () => void {
    return window.api.proposal.archive.archive(input, callbacks);
  },

  loadArchive(
    input: { workspaceId: string } & ProposalRef
  ): Promise<IpcResponse<ArchiveRunMeta | null>> {
    return window.api.proposal.archive.loadArchive(input);
  },

  loadArchiveMessages(
    input: { workspaceId: string } & ProposalRef
  ): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return window.api.proposal.archive.loadArchiveMessages(input);
  },
};
