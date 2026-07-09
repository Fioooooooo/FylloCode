import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";
import type { UIMessage } from "ai";

export const proposalApplyApi = {
  apply(input: {
    projectId: string;
    changeId: string;
    workflowId: string;
  }): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>> {
    return window.api.proposal.apply.apply(input);
  },

  stageStream(
    input: {
      runId: string;
      stageIndex: number;
      projectId: string;
      changeId: string;
    },
    callbacks: Parameters<typeof window.api.proposal.apply.stageStream>[1]
  ): () => void {
    return window.api.proposal.apply.stageStream(input, callbacks);
  },

  loadRun(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<ApplyRunMeta | null>> {
    return window.api.proposal.apply.loadRun(input);
  },

  loadRunMessages(input: {
    projectId: string;
    changeId: string;
    stageIndex: number;
  }): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return window.api.proposal.apply.loadRunMessages(input);
  },
};
