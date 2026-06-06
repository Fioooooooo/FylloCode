import type { IpcMainInvokeEvent, MessagePortMain } from "electron";
import { MessageChannelMain } from "electron";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import logger from "@main/infra/logger";

/** Shape of the business-provided runner that drives a single stream. */
export interface StreamRunner {
  /** Called once, after renderer signals ready. Must resolve/reject when the stream ends. */
  start(): Promise<void>;
  /** Called when the port is closed, an error occurs, or renderer cancels. Must be idempotent. */
  cancel(): void;
}

/** Handle passed to `onReady` so the runner can push chunks + terminal signals back. */
export interface StreamSink {
  /** Forward a chunk to the renderer. No-op once the stream has been finalised. */
  sendChunk(data: MessageChunkData): void;
  /** Finalise the stream successfully. After this call further chunks are dropped. */
  sendDone(totalTokens: number): void;
  /** Finalise the stream with an error. After this call further chunks are dropped. */
  sendError(code: IpcErrorCode, message: string): void;
}

export interface MakeStreamChannelOptions {
  /** The invoke event that triggered the handler; used to post the port back. */
  event: IpcMainInvokeEvent;
  /** The `domain:stream:port` channel name the renderer will listen on. */
  portChannel: string;
  /** A tag used to prefix diagnostic logs. */
  logTag: string;
  /**
   * Invoked once, before renderer readiness. Should create the underlying
   * business runner (opening files, instantiating sessions, etc.) and return it.
   * If this throws, the stream is finalised with the thrown error.
   */
  onReady(sink: StreamSink): Promise<StreamRunner> | StreamRunner;
}

/**
 * Shared implementation of the MessagePort-based streaming protocol used by
 * every `<domain>:stream:*` IPC handler.
 *
 * Protocol:
 *   main -> renderer: postMessage(portChannel, null, [port2])
 *   renderer -> main: port.postMessage({ type: "ready" })
 *   main -> renderer: many { type: "chunk", data }
 *                     finally  { type: "done", data: { totalTokens } }
 *                          or  { type: "error", data: { code, message } }
 *   renderer (optional): close port to cancel
 */
export function makeStreamChannel(options: MakeStreamChannelOptions): IpcResponse<null> {
  const { event, portChannel, logTag, onReady } = options;

  try {
    const { port1, port2 } = new MessageChannelMain();
    event.sender.postMessage(portChannel, null, [port2]);

    const state = createStreamState(port1, logTag);
    let runner: StreamRunner | null = null;

    const sink: StreamSink = {
      sendChunk(data) {
        state.post({ type: "chunk", data });
      },
      sendDone(totalTokens) {
        state.finalise({ type: "done", data: { totalTokens } });
      },
      sendError(code, message) {
        state.finalise({ type: "error", data: { code, message } });
      },
    };

    // Prepare runner up-front so that construction errors can be delivered cleanly.
    Promise.resolve(onReady(sink))
      .then((created) => {
        runner = created;
        if (state.finalised) {
          // onReady may have finalised synchronously via sink.
          runner.cancel();
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: IpcErrorCode }).code ?? IpcErrorCodes.UNKNOWN_ERROR;
        if (state.started) {
          sink.sendError(code, message);
        } else {
          // Renderer hasn't signalled ready yet; cache the error so it can be
          // delivered after the ready handshake completes.
          state.pendingError = { code, message };
        }
      });

    port1.on("close", () => {
      // Ensure the runner is cancelled if renderer disconnects before done/error.
      runner?.cancel();
      state.markClosed();
    });

    port1.on("message", (msg) => {
      const payload = msg.data as { type?: string } | undefined;
      if (payload?.type !== "ready") return;
      if (state.started || state.finalised) return;
      state.started = true;

      // If onReady failed before the renderer signalled ready, deliver the
      // cached error now so the renderer can surface it to the user.
      if (state.pendingError) {
        sink.sendError(state.pendingError.code, state.pendingError.message);
        return;
      }

      // Wait for runner to exist (it may still be settling).
      const launch = (): void => {
        if (!runner) {
          setImmediate(launch);
          return;
        }
        runner.start().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const code = (err as { code?: IpcErrorCode }).code ?? IpcErrorCodes.ACP_ERROR;
          sink.sendError(code, message);
        });
      };

      launch();
    });

    port1.start();
    return { ok: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: IpcErrorCode }).code ?? IpcErrorCodes.UNKNOWN_ERROR;
    return { ok: false, error: { code, message } };
  }
}

interface StreamState {
  finalised: boolean;
  started: boolean;
  pendingError: { code: IpcErrorCode; message: string } | null;
  post(msg: { type: "chunk"; data: MessageChunkData }): void;
  finalise(
    msg:
      | { type: "done"; data: { totalTokens: number } }
      | { type: "error"; data: { code: IpcErrorCode; message: string } }
  ): void;
  markClosed(): void;
}

function createStreamState(port: MessagePortMain, logTag: string): StreamState {
  let finalised = false;
  let closed = false;

  const safePost = (payload: unknown): void => {
    if (closed) return;
    try {
      port.postMessage(payload);
    } catch (err) {
      logger.warn(`[${logTag}] failed to post message to port`, err);
    }
  };

  const safeClose = (): void => {
    if (closed) return;
    closed = true;
    try {
      port.close();
    } catch {
      /* ignore */
    }
  };

  const state: StreamState = {
    started: false,
    pendingError: null,
    get finalised() {
      return finalised;
    },
    post(msg) {
      if (finalised) return;
      safePost(msg);
    },
    finalise(msg) {
      if (finalised) return;
      finalised = true;
      safePost(msg);
      safeClose();
    },
    markClosed() {
      finalised = true;
      closed = true;
    },
  };

  return state;
}
