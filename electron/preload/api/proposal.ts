import { ipcRenderer } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import type { IpcErrorInfo, IpcResponse, MessageChunkData } from "@shared/types/ipc";
import type { ProposalMeta, ApplyRunMeta } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

export interface StreamCallbacks {
  onChunk: (data: MessageChunkData) => void;
  onDone: (data: { totalTokens: number }) => void;
  onError: (error: IpcErrorInfo) => void;
}

export const proposalApi = {
  list(projectId: string): Promise<IpcResponse<ProposalMeta[]>> {
    return ipcRenderer.invoke(ProposalChannels.list, { projectId });
  },

  readFile(
    projectId: string,
    changeId: string,
    filename: string
  ): Promise<IpcResponse<string | null>> {
    return ipcRenderer.invoke(ProposalChannels.readFile, { projectId, changeId, filename });
  },

  apply(input: {
    projectId: string;
    changeId: string;
    workflowId: string;
  }): Promise<IpcResponse<{ runId: string; stages: WorkflowStage[] }>> {
    return ipcRenderer.invoke(ProposalChannels.apply, input);
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
    void ipcRenderer
      .invoke(ProposalChannels.stageStream, input)
      .then((result: IpcResponse<null>) => {
        if (!result.ok) {
          callbacks.onError(result.error);
        }
      })
      .catch((error: unknown) => {
        callbacks.onError({
          code: "STREAM_INIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    ipcRenderer.once(ProposalChannels.stageStreamPort, (event) => {
      const port = event.ports[0];
      port.onmessage = ({ data }) => {
        if (data.type === "chunk") {
          callbacks.onChunk(data.data as MessageChunkData);
        } else if (data.type === "done") {
          callbacks.onDone(data.data as { totalTokens: number });
        } else if (data.type === "error") {
          callbacks.onError(data.data as IpcErrorInfo);
        }
      };
      port.start();
      port.postMessage({ type: "ready" });
    });

    return () => {
      void ipcRenderer.invoke(ProposalChannels.stageStreamCancel, { runId: input.runId });
    };
  },

  archive(
    input: {
      projectId: string;
      changeId: string;
    },
    callbacks: StreamCallbacks
  ): () => void {
    void ipcRenderer
      .invoke(ProposalChannels.archive, input)
      .then((result: IpcResponse<null>) => {
        if (!result.ok) {
          callbacks.onError(result.error);
        }
      })
      .catch((error: unknown) => {
        callbacks.onError({
          code: "STREAM_INIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    ipcRenderer.once(ProposalChannels.archivePort, (event) => {
      const port = event.ports[0];
      port.onmessage = ({ data }) => {
        if (data.type === "chunk") {
          callbacks.onChunk(data.data as MessageChunkData);
        } else if (data.type === "done") {
          callbacks.onDone(data.data as { totalTokens: number });
        } else if (data.type === "error") {
          callbacks.onError(data.data as IpcErrorInfo);
        }
      };
      port.start();
      port.postMessage({ type: "ready" });
    });

    return () => {
      void ipcRenderer.invoke(ProposalChannels.archiveCancel, input);
    };
  },

  loadRun(input: {
    projectId: string;
    changeId: string;
  }): Promise<IpcResponse<ApplyRunMeta | null>> {
    return ipcRenderer.invoke(ProposalChannels.loadRun, input);
  },

  loadRunMessages(input: {
    projectId: string;
    changeId: string;
    stageIndex: number;
  }): Promise<IpcResponse<UIMessage<MessageMeta>[]>> {
    return ipcRenderer.invoke(ProposalChannels.loadRunMessages, input);
  },
};
