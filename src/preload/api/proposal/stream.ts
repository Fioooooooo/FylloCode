import { ipcRenderer } from "electron";
import type { IpcErrorInfo, IpcResponse, MessageChunkData } from "@shared/types/ipc";

export interface StreamCallbacks {
  onChunk: (data: MessageChunkData) => void;
  onDone: (data: { totalTokens: number }) => void;
  onError: (error: IpcErrorInfo) => void;
}

export function startProposalStream<Input>(
  invokeChannel: string,
  portChannel: string,
  input: Input,
  callbacks: StreamCallbacks,
  cancel: () => void
): () => void {
  void ipcRenderer
    .invoke(invokeChannel, input)
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

  ipcRenderer.once(portChannel, (event) => {
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

  return cancel;
}
