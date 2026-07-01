import type { SessionEvent } from "@main/domain/chat/session-events";
import type { Message } from "@shared/types/chat";
import type { MessageChunkData } from "@shared/types/ipc";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import { MessageAssembler } from "@main/services/chat/message-assembler";
import { toMessageChunk, mapAcpErrorCode } from "@main/services/chat/session-event-mapper";
import { sessionRegistry, type SessionOwner } from "@main/services/chat/session-registry";
import type { AcpSession } from "@main/services/chat/acp-session";
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

const CONTENT_KINDS = new Set([
  "text_delta",
  "reasoning_delta",
  "tool_call_start",
  "tool_call_update",
]);

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
  output: StreamOutput;
  hooks: AcpStreamHooks;
  logTag: string;
  start: () => Promise<void>;
}): { start: () => Promise<void>; cancel: () => void } {
  const { session, owner, registryKey, output, hooks, logTag } = args;
  const assembler = new MessageAssembler(registryKey);

  const persistAssembledMessage = async (): Promise<void> => {
    try {
      const message = assembler.flush();
      if (!message) return;
      await hooks.persistMessage(message);
    } catch (error: unknown) {
      logger.error(`[${logTag}] failed to persist partial message on stop`, error);
    }
  };

  sessionRegistry.register(owner, registryKey, session);

  session.on("event", (ev: SessionEvent) => {
    if (CONTENT_KINDS.has(ev.kind)) {
      assembler.apply(ev);
      const chunk = toMessageChunk(ev);
      if (chunk) output.sendChunk(chunk);
      return;
    }

    switch (ev.kind) {
      case "session_id_resolved":
        // Persisted inside AcpSession; nothing to forward.
        return;
      case "done":
        void (async () => {
          const message = assembler.flush();
          if (message) await hooks.persistMessage(message);
          if (hooks.onDone) await hooks.onDone({ totalTokens: ev.totalTokens });
          output.sendDone(ev.totalTokens);
          sessionRegistry.unregister(owner, registryKey);
        })().catch((error: unknown) => {
          logger.error(`[${logTag}] failed to finalise completed message`, error);
          output.sendError(
            hooks.doneFailureCode ?? mapAcpErrorCode((error as { code?: string }).code ?? ""),
            error instanceof Error ? error.message : String(error)
          );
          sessionRegistry.unregister(owner, registryKey);
        });
        return;
      case "error":
        // Both the partial-message persist and the onError side effect are
        // fire-and-forget; sendError + unregister run synchronously right after
        // so the renderer is finalised without waiting on persistence.
        void persistAssembledMessage();
        if (hooks.onError) {
          void hooks.onError({ code: ev.code, message: ev.message }).catch((error: unknown) => {
            logger.error(`[${logTag}] failed to run error side effect`, error);
          });
        }
        output.sendError(mapAcpErrorCode(ev.code), ev.message);
        sessionRegistry.unregister(owner, registryKey);
        return;
      default:
        // Control events (usage/commands/config/agenda/session_info): the driver
        // never forwards or persists these; the handler decides via onControlEvent.
        hooks.onControlEvent?.(ev, output);
        return;
    }
  });

  return {
    start: args.start,
    cancel: () => {
      session.cancel();
      void persistAssembledMessage();
      sessionRegistry.unregister(owner, registryKey);
    },
  };
}
