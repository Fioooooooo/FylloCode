import { ipcRenderer } from "electron";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta, ProposalRef } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";
import type { UIMessage } from "ai";
import { startProposalStream, type StreamCallbacks } from "./stream";

export const proposalApplyApi = {
  apply(
    input: { workspaceId: string; workflowId: string } & ProposalRef
  ): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>> {
    return ipcRenderer.invoke(ProposalApplyChannels.apply, input);
  },

  stageStream(
    input: ProposalRef & {
      runId: string;
      stageIndex: number;
      workspaceId: string;
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
          workspaceId: input.workspaceId,
          runId: input.runId,
        });
      }
    );
  },

  loadRun(input: { workspaceId: string } & ProposalRef): Promise<IpcResponse<ApplyRunMeta | null>> {
    return ipcRenderer.invoke(ProposalApplyChannels.loadRun, input);
  },

  loadRunMessages(
    input: ProposalRef & {
      workspaceId: string;
      stageIndex: number;
    }
  ): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return ipcRenderer.invoke(ProposalApplyChannels.loadRunMessages, input);
  },
};
