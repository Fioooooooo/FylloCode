import type { SessionEvent } from "@main/domain/session/chat/session-events";
import type { Message } from "@shared/types/chat";
import type { MessageChunkData } from "@shared/types/ipc";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import { MessageAssembler } from "@main/services/session/chat/message-assembler";
import { toMessageChunk, mapAcpErrorCode } from "@main/services/session/chat/session-event-mapper";
import { sessionRegistry, type SessionOwner } from "@main/services/session/chat/session-registry";
import type { AcpSession } from "@main/services/session/chat/acp-session";
import logger from "@main/infra/logger";

/**
 * Minimal sink the driver writes to. Structurally compatible with the ipc
 * layer's `StreamSink`, declared here so services/ does not depend on ipc/
 * (the dependency direction stays ipc → services).
 */
export interface StreamOutput {
  sendChunk(data: MessageChunkData): void;
  sendDone(totalTokens: number): void;
  sendError(code: IpcErrorCode, message: string): void;
}

/**
 * The control-flow + side-effect hooks each handler supplies. The driver owns
 * the parts that MUST stay identical across chat/apply/archive (content-delta
 * forwarding, terminal-event scaffolding, registry cleanup); the handler owns
 * everything that legitimately differs (where to persist, which control events
 * to forward/persist, terminal side effects).
 */
export interface AcpStreamHooks {
  /** Persist a fully-assembled message. Append target differs per handler. */
  persistMessage(message: Message): Promise<void>;
  /**
   * Handle a non-content control event (usage/available_commands/config_options/
   * agenda/session_info). The driver does NOTHING with these by itself — it never
   * forwards or persists them — so each handler decides explicitly. Omit to
   * ignore all control events (apply/archive).
   */
  onControlEvent?(ev: SessionEvent, output: StreamOutput): void;
  /** Terminal side effect on `done`, before sendDone. e.g. advance stage / accrue tokens. */
  onDone?(ev: { totalTokens: number }): Promise<void>;
  /** Terminal side effect on `error`, before sendError. e.g. mark run status. */
  onError?(ev: { code: string; message: string }): Promise<void>;
  /**
   * Error code used when the `done` finalisation itself throws (persist /
   * onDone failure). Defaults to mapping the thrown error's `code`. Handlers
   * whose persistence failures have a dedicated code (e.g. APPLY_RUN_PERSIST_FAILED)
   * set it here.
   */
  doneFailureCode?: IpcErrorCode;
}

export type AcpTurnCompletion =
  | { status: "done"; totalTokens: number; message: Message | null }
  | { status: "error"; code: string; message: string; partialMessage: Message | null }
  | { status: "cancelled"; partialMessage: Message | null };

export interface AcpTurnHooks {
  onContentEvent?(event: SessionEvent): void;
  onControlEvent?(event: SessionEvent): void;
  onDone?(event: { totalTokens: number; message: Message | null }): void | Promise<void>;
  onError?(event: {
    code: string;
    message: string;
    partialMessage: Message | null;
  }): void | Promise<void>;
  onCancel?(event: { partialMessage: Message | null }): void | Promise<void>;
  onFinalizationError?(error: unknown): void;
}

export interface AcpTurnRunner {
  start: () => Promise<void>;
  cancel: () => void;
  completion: Promise<AcpTurnCompletion>;
}

// 需要进入 MessageAssembler 并转发为 stream chunk 的内容类事件。
// 控制类事件（session_id_resolved / done / error / usage 等）走 switch 分支单独处理。
const CONTENT_KINDS = new Set([
  "text_delta",
  "reasoning_delta",
  "tool_call_start",
  "tool_call_update",
]);

export function driveAcpTurn(args: {
  session: AcpSession;
  owner: SessionOwner;
  registryKey: string;
  messageSessionId: string;
  hooks: AcpTurnHooks;
  logTag: string;
  start: () => Promise<void>;
}): AcpTurnRunner {
  const { session, owner, registryKey, messageSessionId, hooks, logTag } = args;
  const assembler = new MessageAssembler(messageSessionId);
  let terminal = false;
  let resolveCompletion!: (completion: AcpTurnCompletion) => void;
  const completion = new Promise<AcpTurnCompletion>((resolve) => {
    resolveCompletion = resolve;
  });

  const finish = (
    result: AcpTurnCompletion,
    hook: (() => void | Promise<void>) | undefined
  ): void => {
    if (terminal) return;
    terminal = true;
    sessionRegistry.unregister(owner, registryKey);
    void Promise.resolve()
      .then(() => hook?.())
      .catch((error: unknown) => {
        logger.error(`[${logTag}] failed to finalise ACP turn`, error);
        hooks.onFinalizationError?.(error);
      })
      .finally(() => {
        resolveCompletion(result);
      });
  };

  sessionRegistry.register(owner, registryKey, session);
  session.on("event", (event: SessionEvent) => {
    if (terminal) return;
    if (CONTENT_KINDS.has(event.kind)) {
      assembler.apply(event);
      hooks.onContentEvent?.(event);
      return;
    }

    switch (event.kind) {
      case "session_id_resolved":
        return;
      case "done": {
        const message = assembler.flush();
        finish(
          { status: "done", totalTokens: event.totalTokens, message },
          hooks.onDone
            ? () => hooks.onDone?.({ totalTokens: event.totalTokens, message })
            : undefined
        );
        return;
      }
      case "error": {
        const partialMessage = assembler.flush();
        finish(
          { status: "error", code: event.code, message: event.message, partialMessage },
          hooks.onError
            ? () =>
                hooks.onError?.({
                  code: event.code,
                  message: event.message,
                  partialMessage,
                })
            : undefined
        );
        return;
      }
      default:
        hooks.onControlEvent?.(event);
    }
  });

  return {
    start: args.start,
    cancel: () => {
      if (terminal) return;
      session.cancel();
      const partialMessage = assembler.flush();
      finish(
        { status: "cancelled", partialMessage },
        hooks.onCancel ? () => hooks.onCancel?.({ partialMessage }) : undefined
      );
    },
    completion,
  };
}

/**
 * Wire an AcpSession's event stream to a StreamOutput with a single, shared
 * parsing contract. Returns the start/cancel pair the stream-channel runner
 * needs. See [[acp-stream-driver-design]] for the parse-uniform /
 * side-effect-independent split.
 */
export function driveAcpStream(args: {
  session: AcpSession;
  owner: SessionOwner;
  registryKey: string;
  messageSessionId: string;
  output: StreamOutput;
  hooks: AcpStreamHooks;
  logTag: string;
  start: () => Promise<void>;
}): AcpTurnRunner {
  const { session, owner, registryKey, messageSessionId, output, hooks, logTag } = args;
  const persistPartial = (message: Message | null): void => {
    if (!message) return;
    void Promise.resolve(hooks.persistMessage(message)).catch((error: unknown) => {
      logger.error(`[${logTag}] failed to persist partial message on stop`, error);
    });
  };

  return driveAcpTurn({
    session,
    owner,
    registryKey,
    messageSessionId,
    logTag,
    start: args.start,
    hooks: {
      onContentEvent: (event) => {
        const chunk = toMessageChunk(event);
        if (chunk) output.sendChunk(chunk);
      },
      onControlEvent: (event) => hooks.onControlEvent?.(event, output),
      onDone: async ({ totalTokens, message }) => {
        if (message) await hooks.persistMessage(message);
        if (hooks.onDone) await hooks.onDone({ totalTokens });
        output.sendDone(totalTokens);
      },
      onError: ({ code, message, partialMessage }) => {
        persistPartial(partialMessage);
        if (hooks.onError) {
          void Promise.resolve(hooks.onError({ code, message })).catch((error: unknown) => {
            logger.error(`[${logTag}] failed to run error side effect`, error);
          });
        }
        output.sendError(mapAcpErrorCode(code), message);
      },
      onCancel: ({ partialMessage }) => persistPartial(partialMessage),
      onFinalizationError: (error) => {
        output.sendError(
          hooks.doneFailureCode ?? mapAcpErrorCode((error as { code?: string }).code ?? ""),
          error instanceof Error ? error.message : String(error)
        );
      },
    },
  });
}
