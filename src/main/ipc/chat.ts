import { ipcMain } from "electron";
import { ChatChannels, ChatProbeChannels, ChatStreamChannels } from "@shared/types/channels";
import type { Message } from "@shared/types/chat";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  createSessionInputSchema,
  listSessionsInputSchema,
  loadMessagesInputSchema,
  persistMessageInputSchema,
  probeCloseInputSchema,
  probeEnsureInputSchema,
  probeSetConfigOptionInputSchema,
  readAttachmentDataUrlInputSchema,
  removeSessionInputSchema,
  saveAttachmentInputSchema,
  setActionStateInputSchema,
  setConfigOptionInputSchema,
  streamCancelInputSchema,
  streamMessageInputSchema,
  updateSessionInputSchema,
} from "@shared/schemas/ipc/chat";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { makeStreamChannel } from "./_kit/stream-channel";
import { ipcError } from "./_kit/errors";
import { AcpSession } from "@main/services/chat/acp-session";
import { driveAcpStream } from "@main/services/chat/acp-stream-driver";
import {
  createSession,
  listSessions,
  loadSessionMessages,
  persistSessionMessage,
  removeSession,
  resolveProjectPath,
  setSessionActionState,
  updateSession,
} from "@main/services/chat/chat-service";
import { getByTask, linkTaskSession } from "@main/services/lineage/lineage-service";
import { ensureLineageEventConsumer } from "@main/services/lineage/mcp-event-consumer";
import { setConfigOption } from "@main/services/chat/config-option-service";
import {
  closeProbe,
  ensureProbe,
  setProbeConfigOption,
  takeProbeFor,
} from "@main/services/chat/session-probe-service";
import { sessionProbeBus } from "@main/services/chat/session-probe-bus";
import { sessionRegistry } from "@main/services/chat/session-registry";
import {
  appendMessage,
  loadMessages,
  loadSessionMeta,
  patchSessionMeta,
} from "@main/infra/storage/session-store";
import { sessionMessagesPath } from "@main/infra/storage/session-store";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import {
  readAttachmentDataUrl,
  removeSessionAttachments,
  saveAttachment,
} from "@main/infra/storage/attachment-store";
import { toMessageChunk } from "@main/services/chat/session-event-mapper";
import logger from "@main/infra/logger";
import { ChatAcpSessionStore } from "@main/infra/storage/chat-acp-session-store";
import type { ProjectWindowManager } from "@main/bootstrap/project-window-manager";

let probeBroadcastManager: ProjectWindowManager | null = null;
let probeBroadcastSubscribed = false;

export function setupProbeBroadcast(manager: ProjectWindowManager): void {
  probeBroadcastManager = manager;
  if (probeBroadcastSubscribed) {
    return;
  }

  sessionProbeBus.onUpdate((payload) => {
    probeBroadcastManager?.sendToProject(payload.projectId, ChatProbeChannels.update, payload);
  });
  probeBroadcastSubscribed = true;
}

export function registerChatHandlers(): void {
  ipcMain.handle(ChatChannels.listSessions, (_event, input: unknown) =>
    wrapHandler(async () => {
      const query = validate(listSessionsInputSchema, input);
      const projectPath = await resolveProjectPath(query.projectId);
      ensureLineageEventConsumer(projectPath);
      return listSessions(query.projectId);
    })
  );

  ipcMain.handle(ChatChannels.createSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const session = await createSession(form);
      if (!form.taskRef) {
        return session;
      }

      try {
        const linked = await linkTaskSession(projectPath, form.taskRef, session.id);
        if (!linked) {
          logger.error("[chat] failed to link task session: subject not found", {
            projectId: form.projectId,
            taskRef: form.taskRef,
            sessionId: session.id,
          });
        }
      } catch (error: unknown) {
        logger.error("[chat] failed to link task session", {
          projectId: form.projectId,
          taskRef: form.taskRef,
          sessionId: session.id,
          error,
        });
      }

      return session;
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
      const projectPath = await resolveProjectPath(form.projectId);
      await removeSession(form);
      await removeSessionAttachments(projectPath, form.id);
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

  ipcMain.handle(ChatChannels.saveAttachment, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(saveAttachmentInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const saved = await saveAttachment(
        projectPath,
        form.sessionId,
        form.fileName,
        form.mimeType,
        form.base64Data
      );
      return {
        uri: saved.fileUri,
        name: saved.name,
        mimeType: saved.mimeType,
      };
    })
  );

  ipcMain.handle(ChatChannels.readAttachmentDataUrl, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readAttachmentDataUrlInputSchema, input);
      const dataUrl = await readAttachmentDataUrl(form.uri, form.mediaType);
      return { dataUrl };
    })
  );

  ipcMain.handle(ChatChannels.setConfigOption, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(setConfigOptionInputSchema, input);
      return setConfigOption(form);
    })
  );

  ipcMain.handle(ChatChannels.setActionState, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(setActionStateInputSchema, input);
      return setSessionActionState(form);
    })
  );

  ipcMain.handle(ChatProbeChannels.ensure, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeEnsureInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return ensureProbe(form.projectId, form.agentId, projectPath);
    })
  );

  ipcMain.handle(ChatProbeChannels.close, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeCloseInputSchema, input);
      await closeProbe(form.projectId, form.agentId);
    })
  );

  ipcMain.handle(ChatProbeChannels.setConfigOption, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeSetConfigOptionInputSchema, input);
      return setProbeConfigOption(form);
    })
  );

  // Streaming: create MessagePort via stream-channel kit
  ipcMain.handle(ChatStreamChannels.streamMessage, (event, input: unknown) => {
    const {
      sessionId,
      streamId,
      projectId,
      agentId: inputAgentId,
      prompt,
      acpSessionId,
    } = validate(streamMessageInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: ChatStreamChannels.streamPort,
      portPayload: { streamId },
      logTag: "chat",
      onReady: async (sink) => {
        const projectPath = await resolveProjectPath(projectId);
        const meta = await loadSessionMeta(projectPath, sessionId);
        const agentId = inputAgentId || meta?.agentId;
        if (!agentId) {
          throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "agentId is required");
        }
        let taskTitle: string | undefined;
        if (meta?.originTaskRef) {
          try {
            const taskProjection = await getByTask(projectPath, meta.originTaskRef);
            const snapshotTitle = taskProjection?.task?.snapshot.title;
            taskTitle = snapshotTitle ? snapshotTitle : undefined;
          } catch (error: unknown) {
            logger.warn("[chat] failed to load task title for system reminder", error);
          }
        }
        let presetAcpSessionId: string | undefined;
        if (acpSessionId) {
          const probeEntry = await takeProbeFor(projectId, agentId, acpSessionId);
          if (!probeEntry) {
            sink.sendError(
              IpcErrorCodes.VALIDATION_ERROR,
              "probe acpSessionId 不匹配或已被 consume"
            );
            return {
              start: async () => {},
              cancel: () => {},
            };
          }
          await patchSessionMeta(projectPath, sessionId, {
            acpSessionId,
            agentId,
            configOptions: probeEntry.configOptions,
            available_commands: probeEntry.availableCommands,
            updatedAt: new Date().toISOString(),
          });
          presetAcpSessionId = acpSessionId;
        }
        const sessionStore = new ChatAcpSessionStore(projectPath, sessionId, agentId);

        const session = new AcpSession({
          fylloSessionId: sessionId,
          agentId,
          projectPath,
          cwd: projectPath,
          owner: "chat",
          sessionStore,
          reminderContext: {
            taskRef: meta?.originTaskRef,
            taskTitle,
          },
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
          ...(presetAcpSessionId ? { presetAcpSessionId } : {}),
        });
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
        return driveAcpStream({
          session,
          owner: "chat",
          registryKey: `${projectId}:${sessionId}`,
          output: sink,
          logTag: "chat",
          start: () => session.start(prompt),
          hooks: {
            persistMessage: (message) => appendMessage(projectPath, sessionId, message),
            onControlEvent: (ev, output) => {
              switch (ev.kind) {
                case "usage_update": {
                  const chunk = toMessageChunk(ev);
                  if (chunk) output.sendChunk(chunk);
                  enqueueSessionMetaPersist(
                    {
                      tokenUsage: { used: ev.used, size: ev.size, cost: ev.cost },
                      updatedAt: new Date().toISOString(),
                    },
                    "[chat] failed to persist session usage update"
                  );
                  break;
                }
                case "available_commands_update": {
                  const chunk = toMessageChunk(ev);
                  if (chunk) output.sendChunk(chunk);
                  enqueueSessionMetaPersist(
                    {
                      available_commands: ev.commands,
                      updatedAt: new Date().toISOString(),
                    },
                    "[chat] failed to persist session available commands update"
                  );
                  break;
                }
                case "config_options_update": {
                  const chunk = toMessageChunk(ev);
                  if (chunk) output.sendChunk(chunk);
                  enqueueSessionMetaPersist(
                    {
                      configOptions: ev.options,
                      updatedAt: new Date().toISOString(),
                    },
                    "[chat] failed to persist session config options update"
                  );
                  break;
                }
                case "agenda_update": {
                  // agentAgenda 为运行时态，仅透传给 renderer，不持久化到 session meta。
                  const chunk = toMessageChunk(ev);
                  if (chunk) output.sendChunk(chunk);
                  break;
                }
                case "session_info_update": {
                  enqueueSessionMetaPersist(
                    { title: ev.title, updatedAt: new Date().toISOString() },
                    "[chat] failed to persist session title update"
                  );
                  const chunk = toMessageChunk(ev);
                  if (chunk) output.sendChunk(chunk);
                  break;
                }
                default:
                  break;
              }
            },
            onDone: async ({ totalTokens }) => {
              await sessionMetaPersist;
              await patchSessionMeta(projectPath, sessionId, (currentMeta) => ({
                tokenUsage: {
                  used: currentMeta.tokenUsage.used + totalTokens,
                  size: currentMeta.tokenUsage.size,
                  cost: currentMeta.tokenUsage.cost,
                },
                updatedAt: new Date().toISOString(),
              }));
            },
          },
        });
      },
    });
  });

  ipcMain.handle(ChatStreamChannels.streamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, sessionId } = validate(streamCancelInputSchema, input);
      sessionRegistry.cancel("chat", `${projectId}:${sessionId}`);
    })
  );
}
