import { ipcMain } from "electron";
import {
  SessionChatChannels,
  SessionChatProbeChannels,
  SessionChatStreamChannels,
} from "@shared/ipc/session/chat.channels";
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
  setConfigOptionInputSchema,
  streamCancelInputSchema,
  streamMessageInputSchema,
  updateSessionInputSchema,
} from "@shared/ipc/session/chat.schemas";
import { wrapHandler } from "../_kit/wrap-handler";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { createSessionWorkspaceSnapshot } from "@main/domain/session/chat/session-workspace-snapshot";
import { assertAgentWorkspaceCompatibility } from "@main/services/session/chat/agent-workspace-compatibility";
import { validate } from "../_kit/schema";
import { makeStreamChannel } from "../_kit/stream-channel";
import { ipcError } from "../_kit/errors";
import { AcpSession, driveAcpStream } from "@main/services/session/_public";
import {
  createSession,
  ensureSessionWorkspaceSnapshot,
  listSessions,
  loadSessionMessages,
  persistSessionMessage,
  removeSession,
  updateSession,
} from "@main/services/session/chat/chat-service";
import {
  ensureLineageEventConsumer,
  getByTask,
  linkTaskSession,
} from "@main/services/insight/_public";
import { setConfigOption } from "@main/services/session/chat/config-option-service";
import {
  closeProbe,
  ensureProbe,
  getProbeWorkspaceSnapshotForPromotion,
  setProbeConfigOption,
  takeProbeFor,
} from "@main/services/session/chat/session-probe-service";
import { sessionProbeBus } from "@main/services/session/chat/session-probe-bus";
import { sessionRegistry } from "@main/services/session/chat/session-registry";
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
import { toMessageChunk } from "@main/services/session/chat/session-event-mapper";
import logger from "@main/infra/logger";
import { ChatAcpSessionStore } from "@main/infra/storage/chat-acp-session-store";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";

let probeBroadcastManager: WorkspaceWindowManager | null = null;
let probeBroadcastSubscribed = false;

// Wire probe lifecycle updates from the main-process bus to all Workspace windows.
// Called once during bootstrap after the window manager is available.
export function setupProbeBroadcast(manager: WorkspaceWindowManager): void {
  probeBroadcastManager = manager;
  if (probeBroadcastSubscribed) {
    return;
  }

  sessionProbeBus.onUpdate((payload) => {
    probeBroadcastManager?.sendToWorkspace(
      payload.workspaceId,
      SessionChatProbeChannels.update,
      payload
    );
  });
  probeBroadcastSubscribed = true;
}

export function registerChatHandlers(): void {
  ipcMain.handle(SessionChatChannels.listSessions, (_event, input: unknown) =>
    wrapHandler(async () => {
      const query = validate(listSessionsInputSchema, input);
      await resolveWorkspace(query.workspaceId);
      ensureLineageEventConsumer(query.workspaceId);
      return listSessions(query.workspaceId);
    })
  );

  ipcMain.handle(SessionChatChannels.createSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionInputSchema, input);
      const workspaceSnapshot = form.acpSessionId
        ? getProbeWorkspaceSnapshotForPromotion(form.workspaceId, form.agentId, form.acpSessionId)
        : null;
      if (form.acpSessionId && !workspaceSnapshot) {
        throw ipcError(
          IpcErrorCodes.VALIDATION_ERROR,
          "probe acpSessionId does not match the Workspace, Agent, and frozen snapshot"
        );
      }
      const targetSnapshot =
        workspaceSnapshot ??
        createSessionWorkspaceSnapshot(await resolveWorkspace(form.workspaceId));
      await assertAgentWorkspaceCompatibility(form.agentId, targetSnapshot);
      const session = await createSession({
        ...form,
        workspaceSnapshot: targetSnapshot,
      });
      if (!form.taskRef) {
        return session;
      }

      try {
        const linked = await linkTaskSession(form.workspaceId, form.taskRef, session.id);
        if (!linked) {
          logger.error("[chat] failed to link task session: subject not found", {
            workspaceId: form.workspaceId,
            taskRef: form.taskRef,
            sessionId: session.id,
          });
        }
      } catch (error: unknown) {
        logger.error("[chat] failed to link task session", {
          workspaceId: form.workspaceId,
          taskRef: form.taskRef,
          sessionId: session.id,
          error,
        });
      }

      return session;
    })
  );

  ipcMain.handle(SessionChatChannels.updateSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(updateSessionInputSchema, input);
      return updateSession(form);
    })
  );

  ipcMain.handle(SessionChatChannels.removeSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(removeSessionInputSchema, input);
      await removeSession(form);
      await removeSessionAttachments(form.workspaceId, form.id);
    })
  );

  ipcMain.handle(SessionChatChannels.loadMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadMessagesInputSchema, input);
      return loadSessionMessages(form);
    })
  );

  ipcMain.handle(SessionChatChannels.persistMessage, (_event, input: unknown) =>
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
        workspaceId: form.workspaceId,
        message,
      });
      logger.debug("[chat] persistMessage done");
    })
  );

  ipcMain.handle(SessionChatChannels.saveAttachment, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(saveAttachmentInputSchema, input);
      const saved = await saveAttachment(
        form.workspaceId,
        form.sessionId,
        form.fileName,
        form.mimeType,
        form.base64Data
      );
      return {
        attachmentId: saved.attachmentId,
        name: saved.name,
        mimeType: saved.mimeType,
      };
    })
  );

  ipcMain.handle(SessionChatChannels.readAttachmentDataUrl, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readAttachmentDataUrlInputSchema, input);
      const dataUrl = await readAttachmentDataUrl(
        form.workspaceId,
        form.sessionId,
        form.attachmentId,
        form.mediaType
      );
      return { dataUrl };
    })
  );

  ipcMain.handle(SessionChatChannels.setConfigOption, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(setConfigOptionInputSchema, input);
      return setConfigOption(form);
    })
  );

  ipcMain.handle(SessionChatProbeChannels.ensure, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeEnsureInputSchema, input);
      const workspaceSnapshot = createSessionWorkspaceSnapshot(
        await resolveWorkspace(form.workspaceId)
      );
      await assertAgentWorkspaceCompatibility(form.agentId, workspaceSnapshot);
      return ensureProbe(form.workspaceId, form.agentId, workspaceSnapshot);
    })
  );

  ipcMain.handle(SessionChatProbeChannels.close, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeCloseInputSchema, input);
      await closeProbe(form.workspaceId, form.agentId);
    })
  );

  ipcMain.handle(SessionChatProbeChannels.setConfigOption, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeSetConfigOptionInputSchema, input);
      return setProbeConfigOption(form);
    })
  );

  // Streaming: create a MessagePort-based stream channel and drive the ACP session.
  ipcMain.handle(SessionChatStreamChannels.streamMessage, (event, input: unknown) => {
    const {
      sessionId,
      streamId,
      workspaceId,
      agentId: inputAgentId,
      prompt,
      acpSessionId,
    } = validate(streamMessageInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: SessionChatStreamChannels.streamPort,
      portPayload: { streamId },
      logTag: "chat",
      onReady: async (sink) => {
        const meta = await loadSessionMeta(workspaceId, sessionId);
        const agentId = inputAgentId || meta?.agentId;
        if (!agentId) {
          throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "agentId is required");
        }
        const workspaceSnapshot = await ensureSessionWorkspaceSnapshot(workspaceId, sessionId);
        await assertAgentWorkspaceCompatibility(agentId, workspaceSnapshot);
        const workspaceCwd = workspaceSnapshot.cwd;

        // Load the originating task title so the system reminder can contextualize the chat.
        let taskTitle: string | undefined;
        if (meta?.originTaskRef) {
          try {
            const taskProjection = await getByTask(workspaceId, meta.originTaskRef);
            const snapshotTitle = taskProjection?.task?.snapshot.title;
            taskTitle = snapshotTitle ? snapshotTitle : undefined;
          } catch (error: unknown) {
            logger.warn("[chat] failed to load task title for system reminder", error);
          }
        }
        // If the renderer provided a probe ACP session id, take ownership of it and copy its
        // config/commands into the chat session meta. Otherwise the chat session will recover
        // or create its own ACP session.
        let presetAcpSessionId: string | undefined;
        if (acpSessionId) {
          const probeEntry = await takeProbeFor(workspaceId, agentId, acpSessionId);
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
          await patchSessionMeta(workspaceId, sessionId, {
            acpSessionId,
            agentId,
            configOptions: probeEntry.configOptions,
            available_commands: probeEntry.availableCommands,
            updatedAt: new Date().toISOString(),
          });
          presetAcpSessionId = acpSessionId;
        }
        const sessionStore = new ChatAcpSessionStore(workspaceId, sessionId, agentId);

        const session = new AcpSession({
          fylloSessionId: sessionId,
          agentId,
          workspaceId,
          projectPath: workspaceCwd,
          cwd: workspaceCwd,
          additionalDirectories: workspaceSnapshot.additionalDirectories,
          workspaceSnapshot,
          owner: "chat",
          sessionStore,
          reminderContext: {
            taskRef: meta?.originTaskRef,
            taskTitle,
          },
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              sessionMessagesPath(workspaceId, sessionId),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () => loadMessages(workspaceId, sessionId),
          },
          ...(presetAcpSessionId ? { presetAcpSessionId } : {}),
        });
        // Serialize session meta updates so they never overwrite each other when multiple
        // control events arrive in quick succession.
        let sessionMetaPersist = Promise.resolve();
        const enqueueSessionMetaPersist = (
          update: Parameters<typeof patchSessionMeta>[2],
          failureMessage: string
        ): void => {
          sessionMetaPersist = sessionMetaPersist
            .then(async () => {
              const nextMeta = await patchSessionMeta(workspaceId, sessionId, update);
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
          registryKey: `${workspaceId}:${sessionId}`,
          messageSessionId: sessionId,
          output: sink,
          logTag: "chat",
          start: () => session.start(prompt),
          hooks: {
            persistMessage: (message) => appendMessage(workspaceId, sessionId, message),
            onControlEvent: (ev, output) => {
              // Control events update session meta and/or forward renderer-visible chunks.
              // agenda_update is runtime-only and intentionally not persisted.
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
              await patchSessionMeta(workspaceId, sessionId, (currentMeta) => ({
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

  ipcMain.handle(SessionChatStreamChannels.streamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, sessionId } = validate(streamCancelInputSchema, input);
      sessionRegistry.cancel("chat", `${workspaceId}:${sessionId}`);
    })
  );
}
