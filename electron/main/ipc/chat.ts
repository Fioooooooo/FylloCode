import { ipcMain } from "electron";
import { ChatChannels, ChatStreamChannels } from "@shared/types/channels";
import type { Message } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import {
  createSessionInputSchema,
  listSessionsInputSchema,
  loadMessagesInputSchema,
  persistMessageInputSchema,
  removeSessionInputSchema,
  streamCancelInputSchema,
  streamMessageInputSchema,
  updateSessionInputSchema,
} from "@shared/schemas/ipc/chat";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { makeStreamChannel } from "./_kit/stream-channel";
import { ipcError } from "./_kit/errors";
import { AcpSession } from "@main/services/chat/acp-session";
import { MessageAssembler } from "@main/services/chat/message-assembler";
import {
  createSession,
  listSessions,
  loadSessionMessages,
  persistSessionMessage,
  removeSession,
  resolveProjectPath,
  updateSession,
} from "@main/services/chat/chat-service";
import { sessionRegistry } from "@main/services/chat/session-registry";
import {
  appendMessage,
  loadMessages,
  loadSessionMeta,
  patchSessionMeta,
} from "@main/infra/storage/session-store";
import { sessionMessagesPath } from "@main/infra/storage/session-store";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { toMessageChunk } from "@main/services/chat/session-event-mapper";
import type { SessionEvent } from "@main/domain/chat/session-events";
import logger from "@main/infra/logger";
import { ChatAcpSessionStore } from "@main/infra/storage/chat-acp-session-store";

function mapAcpErrorCode(raw: string): IpcErrorCode {
  if (raw === IpcErrorCodes.ACP_NOT_READY) return IpcErrorCodes.ACP_NOT_READY;
  if (raw === IpcErrorCodes.ACP_EXIT_GIVEUP) return IpcErrorCodes.ACP_EXIT_GIVEUP;
  if (raw === IpcErrorCodes.SPAWN_ERROR) return IpcErrorCodes.SPAWN_ERROR;
  return IpcErrorCodes.ACP_ERROR;
}

export function registerChatHandlers(): void {
  ipcMain.handle(ChatChannels.listSessions, (_event, input: unknown) =>
    wrapHandler(async () => {
      const query = validate(listSessionsInputSchema, input);
      return listSessions(query.projectId);
    })
  );

  ipcMain.handle(ChatChannels.createSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionInputSchema, input);
      return createSession(form);
    })
  );

  ipcMain.handle(ChatChannels.updateSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(updateSessionInputSchema, input);
      return updateSession(form);
    })
  );

  ipcMain.handle(ChatChannels.removeSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(removeSessionInputSchema, input);
      await removeSession(form);
    })
  );

  ipcMain.handle(ChatChannels.loadMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadMessagesInputSchema, input);
      return loadSessionMessages(form);
    })
  );

  ipcMain.handle(ChatChannels.persistMessage, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(persistMessageInputSchema, input);
      const message = form.message as unknown as Message;
      if (message.role !== "user") {
        throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "message.role must be user");
      }
      logger.debug(
        `[chat] persistMessage sessionId=${form.sessionId} role=${message.role} parts=${message.parts.length}`
      );
      await persistSessionMessage({
        sessionId: form.sessionId,
        projectId: form.projectId,
        message,
      });
      logger.debug("[chat] persistMessage done");
    })
  );

  // Streaming: create MessagePort via stream-channel kit
  ipcMain.handle(ChatStreamChannels.streamMessage, (event, input: unknown) => {
    const {
      sessionId,
      projectId,
      agentId: inputAgentId,
      prompt,
    } = validate(streamMessageInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: ChatStreamChannels.streamPort,
      logTag: "chat",
      onReady: async (sink) => {
        const projectPath = await resolveProjectPath(projectId);
        const meta = await loadSessionMeta(projectPath, sessionId);
        const agentId = inputAgentId || meta?.agentId;
        if (!agentId) {
          throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "agentId is required");
        }
        const sessionStore = new ChatAcpSessionStore(projectPath, sessionId, agentId);

        const session = new AcpSession({
          fylloSessionId: sessionId,
          agentId,
          projectPath,
          cwd: projectPath,
          owner: "chat",
          sessionStore,
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              sessionMessagesPath(projectPath, sessionId),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () => loadMessages(projectPath, sessionId),
          },
        });
        const assembler = new MessageAssembler(sessionId);
        let sessionMetaPersist = Promise.resolve();
        const enqueueSessionMetaPersist = (
          update: Parameters<typeof patchSessionMeta>[2],
          failureMessage: string
        ): void => {
          sessionMetaPersist = sessionMetaPersist
            .then(async () => {
              const nextMeta = await patchSessionMeta(projectPath, sessionId, update);
              if (!nextMeta) {
                logger.warn(
                  `[chat] skipped session meta update because meta was missing: ${sessionId}`
                );
              }
            })
            .catch((error: unknown) => {
              logger.error(failureMessage, error);
            });
        };
        sessionRegistry.register("chat", sessionId, session);

        session.on("event", (ev: SessionEvent) => {
          switch (ev.type) {
            case "session_id_resolved":
              // Already persisted inside AcpSession.
              break;
            case "text_delta":
            case "reasoning_delta":
            case "tool_call_start":
            case "tool_call_update": {
              assembler.apply(ev);
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "usage_update": {
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              enqueueSessionMetaPersist(
                {
                  tokenUsage: {
                    used: ev.used,
                    size: ev.size,
                    cost: ev.cost,
                  },
                  updatedAt: new Date().toISOString(),
                },
                "[chat] failed to persist session usage update"
              );
              break;
            }
            case "available_commands_update": {
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              enqueueSessionMetaPersist(
                {
                  available_commands: ev.commands,
                  updatedAt: new Date().toISOString(),
                },
                "[chat] failed to persist session available commands update"
              );
              break;
            }
            case "session_info_update":
              enqueueSessionMetaPersist(
                {
                  title: ev.title,
                  updatedAt: new Date().toISOString(),
                },
                "[chat] failed to persist session title update"
              );
              {
                const chunk = toMessageChunk(ev);
                if (chunk) sink.sendChunk(chunk);
              }
              break;
            case "done":
              void (async () => {
                const message = assembler.flush();
                if (message) {
                  await appendMessage(projectPath, sessionId, message);
                }
                await sessionMetaPersist;
                await patchSessionMeta(projectPath, sessionId, (currentMeta) => ({
                  tokenUsage: {
                    used: currentMeta.tokenUsage.used + ev.totalTokens,
                    size: currentMeta.tokenUsage.size,
                    cost: currentMeta.tokenUsage.cost,
                  },
                  updatedAt: new Date().toISOString(),
                }));
                sink.sendDone(ev.totalTokens);
                sessionRegistry.unregister("chat", sessionId);
              })().catch((error: unknown) => {
                logger.error("[chat] failed to persist completed assistant message", error);
                sink.sendError(
                  IpcErrorCodes.ACP_ERROR,
                  error instanceof Error ? error.message : String(error)
                );
                sessionRegistry.unregister("chat", sessionId);
              });
              break;
            case "error":
              sink.sendError(mapAcpErrorCode(ev.code), ev.message);
              sessionRegistry.unregister("chat", sessionId);
              break;
            default: {
              const _exhaustive: never = ev;
              void _exhaustive;
              throw new Error(`unhandled session event: ${(ev as SessionEvent).type}`);
            }
          }
        });

        return {
          start: async () => {
            await session.start(prompt);
          },
          cancel: () => {
            session.cancel();
            sessionRegistry.unregister("chat", sessionId);
          },
        };
      },
    });
  });

  ipcMain.handle(ChatStreamChannels.streamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { sessionId } = validate(streamCancelInputSchema, input);
      sessionRegistry.cancel("chat", sessionId);
    })
  );
}
