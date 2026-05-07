import { ipcMain } from "electron";
import { ChatChannels, ChatStreamChannels } from "@shared/types/channels";
import type { Message, Session } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { DEFAULT_ACP_AGENT_ID } from "@shared/constants/agents";
import {
  createSessionInputSchema,
  getSessionInputSchema,
  listSessionsInputSchema,
  loadMessagesInputSchema,
  persistMessageInputSchema,
  removeSessionInputSchema,
  sendMessageInputSchema,
  streamCancelInputSchema,
  streamMessageInputSchema,
  updateSessionInputSchema,
} from "@shared/schemas/ipc/chat";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { makeStreamChannel } from "./_kit/stream-channel";
import { AcpSession } from "@main/services/chat/acp-session";
import {
  appendMessage,
  deleteSession,
  listSessionMetas,
  loadMessages as loadPersistedMessages,
  loadSessionMeta,
  saveSessionMeta,
  type SessionMeta,
} from "@main/infra/storage/session-store";
import { toMessageChunk } from "@main/services/chat/session-event-mapper";
import { loadProject } from "@main/infra/storage/project-store";
import type { SessionEvent } from "@main/domain/chat/session-events";
import logger from "@main/infra/logger";

// Active sessions: fylloSessionId → AcpSession
const activeSessions = new Map<string, AcpSession>();

async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }

  return project.path;
}

function toSession(meta: SessionMeta, projectId: string): Session {
  return {
    id: meta.sessionId,
    projectId,
    agentId: meta.agentId,
    title: meta.title,
    status: "ended",
    turnCount: meta.turnCount,
    createdAt: new Date(meta.createdAt),
    updatedAt: new Date(meta.updatedAt),
    messages: [],
  };
}

export function registerChatHandlers(): void {
  ipcMain.handle(ChatChannels.listSessions, (_event, input: unknown) =>
    wrapHandler(async () => {
      const query = validate(listSessionsInputSchema, input);
      const projectPath = await resolveProjectPath(query.projectId);
      const metas = await listSessionMetas(projectPath);

      void query.page;
      void query.limit;

      return metas
        .sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        )
        .map((meta) => toSession(meta, query.projectId));
    })
  );

  ipcMain.handle(ChatChannels.getSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(getSessionInputSchema, input);
      void id;
      return null;
    })
  );

  ipcMain.handle(ChatChannels.createSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const now = new Date();
      const meta: SessionMeta = {
        sessionId: `session-${now.getTime()}`,
        agentId: form.agentId ?? DEFAULT_ACP_AGENT_ID,
        title: form.title,
        turnCount: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await saveSessionMeta(projectPath, meta);
      return toSession(meta, form.projectId);
    })
  );

  ipcMain.handle(ChatChannels.updateSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id, patch, projectId } = validate(updateSessionInputSchema, input);
      const projectPath = await resolveProjectPath(projectId);
      const meta = await loadSessionMeta(projectPath, id);
      if (!meta) {
        throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${id}`);
      }

      const nextMeta: SessionMeta = {
        ...meta,
        title: patch.title ?? meta.title,
        agentId: patch.agentId ?? meta.agentId,
        updatedAt: new Date().toISOString(),
      };

      await saveSessionMeta(projectPath, nextMeta);
      return toSession(nextMeta, projectId);
    })
  );

  ipcMain.handle(ChatChannels.removeSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id, projectId } = validate(removeSessionInputSchema, input);
      const projectPath = await resolveProjectPath(projectId);
      await deleteSession(projectPath, id);
    })
  );

  ipcMain.handle(ChatChannels.loadMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { sessionId, projectId } = validate(loadMessagesInputSchema, input);
      const projectPath = await resolveProjectPath(projectId);
      return loadPersistedMessages(projectPath, sessionId);
    })
  );

  ipcMain.handle(ChatChannels.sendMessage, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(sendMessageInputSchema, input);
      return null;
    })
  );

  ipcMain.handle(ChatChannels.persistMessage, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { sessionId, projectId, message } = validate(persistMessageInputSchema, input);
      const typedMessage = message as Message;
      logger.debug(
        `[chat] persistMessage sessionId=${sessionId} role=${typedMessage.role} parts=${typedMessage.parts.length}`
      );
      const projectPath = await resolveProjectPath(projectId);
      await appendMessage(projectPath, sessionId, typedMessage);
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
        const agentId = inputAgentId || meta?.agentId || DEFAULT_ACP_AGENT_ID;

        const session = new AcpSession({
          fylloSessionId: sessionId,
          agentId,
          projectPath,
          cwd: projectPath,
        });
        activeSessions.set(sessionId, session);

        session.on("event", (ev: SessionEvent) => {
          switch (ev.type) {
            case "session_id_resolved":
              // Already persisted inside AcpSession.
              break;
            case "text_delta":
            case "tool_call_start":
            case "tool_call_update": {
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "session_info_update":
              void (async () => {
                const currentMeta = await loadSessionMeta(projectPath, sessionId);
                if (currentMeta) {
                  await saveSessionMeta(projectPath, {
                    ...currentMeta,
                    title: ev.title,
                    updatedAt: new Date().toISOString(),
                  });
                }

                const chunk = toMessageChunk(ev);
                if (chunk) sink.sendChunk(chunk);
              })().catch((error: unknown) => {
                logger.error("[chat] failed to persist session title update", error);
              });
              break;
            case "done":
              sink.sendDone(ev.totalTokens);
              activeSessions.delete(sessionId);
              break;
            case "error":
              sink.sendError(mapAcpErrorCode(ev.code), ev.message);
              activeSessions.delete(sessionId);
              break;
          }
        });

        return {
          start: async () => {
            await session.start(prompt);
          },
          cancel: () => {
            session.cancel();
            activeSessions.delete(sessionId);
          },
        };
      },
    });
  });

  ipcMain.handle(ChatStreamChannels.streamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { sessionId } = validate(streamCancelInputSchema, input);
      const session = activeSessions.get(sessionId);
      if (session) {
        session.cancel();
        activeSessions.delete(sessionId);
      }
    })
  );
}

function mapAcpErrorCode(raw: string): import("@shared/constants/error-codes").IpcErrorCode {
  if (raw === IpcErrorCodes.ACP_NOT_READY) return IpcErrorCodes.ACP_NOT_READY;
  if (raw === IpcErrorCodes.ACP_EXIT_GIVEUP) return IpcErrorCodes.ACP_EXIT_GIVEUP;
  if (raw === IpcErrorCodes.SPAWN_ERROR) return IpcErrorCodes.SPAWN_ERROR;
  return IpcErrorCodes.ACP_ERROR;
}
