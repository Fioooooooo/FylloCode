import type { IpcResponse } from "@shared/types/ipc";
import type { ApplyRunMeta, ProposalMeta } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

export const proposalApi = {
  list(projectId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return window.api.proposal.list(projectId);
  },

  readFile(
    projectId: string,
    changeId: string,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return window.api.proposal.readFile(projectId, changeId, filename);
  },

  apply(input: {
    projectId: string;
    changeId: string;
    workflowId: string;
  }): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>> {
    return window.api.proposal.apply(input);
  },

  stageStream(
    input: {
      runId: string;
      stageIndex: number;
      projectId: string;
      changeId: string;
    },
    callbacks: Parameters<typeof window.api.proposal.stageStream>[1]
  ): () => void {
    return window.api.proposal.stageStream(input, callbacks);
  },

  archive(
    input: {
      projectId: string;
      changeId: string;
    },
    callbacks: Parameters<typeof window.api.proposal.archive>[1]
  ): () => void {
    return window.api.proposal.archive(input, callbacks);
  },

  loadRun(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<ApplyRunMeta | null>> {
    return window.api.proposal.loadRun(input);
  },

  loadRunMessages(input: {
    projectId: string;
    changeId: string;
    stageIndex: number;
  }): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return window.api.proposal.loadRunMessages(input);
  },
};
