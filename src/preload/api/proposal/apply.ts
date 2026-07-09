import { ipcRenderer } from "electron";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";
import type { UIMessage } from "ai";
import { startProposalStream, type StreamCallbacks } from "./stream";

export const proposalApplyApi = {
  apply(input: {
    projectId: string;
    changeId: string;
    workflowId: string;
  }): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>> {
    return ipcRenderer.invoke(ProposalApplyChannels.apply, input);
  },

  stageStream(
    input: {
      runId: string;
      stageIndex: number;
      projectId: string;
      changeId: string;
    },
    callbacks: StreamCallbacks
  ): () => void {
    return startProposalStream(
      ProposalApplyChannels.stageStream,
      ProposalApplyChannels.stageStreamPort,
      input,
      callbacks,
      () => {
        void ipcRenderer.invoke(ProposalApplyChannels.stageStreamCancel, {
          projectId: input.projectId,
          runId: input.runId,
        });
      }
    );
  },

  loadRun(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<ApplyRunMeta | null>> {
    return ipcRenderer.invoke(ProposalApplyChannels.loadRun, input);
  },

  loadRunMessages(input: {
    projectId: string;
    changeId: string;
    stageIndex: number;
  }): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return ipcRenderer.invoke(ProposalApplyChannels.loadRunMessages, input);
  },
};
