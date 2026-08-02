import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta, ProposalRef } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";
import type { UIMessage } from "ai";

export const proposalApplyApi = {
  apply(
    input: { workspaceId: string; workflowId: string } & ProposalRef
  ): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>> {
    return window.api.proposal.apply.apply(input);
  },

  stageStream(
    input: ProposalRef & {
      runId: string;
      stageIndex: number;
      workspaceId: string;
    },
    callbacks: Parameters<typeof window.api.proposal.apply.stageStream>[1]
  ): () => void {
    return window.api.proposal.apply.stageStream(input, callbacks);
  },

  loadRun(input: { workspaceId: string } & ProposalRef): Promise<IpcResponse<ApplyRunMeta | null>> {
    return window.api.proposal.apply.loadRun(input);
  },

  loadRunMessages(
    input: ProposalRef & {
      workspaceId: string;
      stageIndex: number;
    }
  ): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return window.api.proposal.apply.loadRunMessages(input);
  },
};
