import { ipcMain } from "electron";
import {
  SessionChatChannels,
  SessionChatNotificationChannels,
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
  searchSessionsInputSchema,
  setConfigOptionInputSchema,
  streamCancelInputSchema,
  streamMessageInputSchema,
  updateSessionInputSchema,
  dispatchSpawnNotificationInputSchema,
  listSpawnNotificationsInputSchema,
} from "@shared/ipc/session/chat.schemas";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { createSessionWorkspaceSnapshot } from "@main/domain/session/chat/session-workspace-snapshot";
import { assertAgentWorkspaceCompatibility } from "@main/services/session/chat/agent-workspace-compatibility";
import { validate } from "../_kit/schema";
import { makeStreamChannel } from "../_kit/stream-channel";
import { ipcError } from "../_kit/errors";
import {
  assertSessionBelongsToWorkspace,
  createSession,
  listSessions,
  loadSessionMessages,
  persistSessionMessage,
  removeSession,
  updateSession,
} from "@main/services/session/chat/chat-service";
import { searchSessions } from "@main/services/session/chat/session-search-service";
import { ensureLineageEventConsumer, linkTaskSession } from "@main/services/insight/_public";
import { setConfigOption } from "@main/services/session/chat/config-option-service";
import {
  closeProbe,
  ensureProbe,
  getProbeWorkspaceSnapshotForPromotion,
  setProbeConfigOption,
} from "@main/services/session/chat/session-probe-service";
import { sessionProbeBus } from "@main/services/session/chat/session-probe-bus";
import { sessionRegistry } from "@main/services/session/chat/session-registry";
import {
  readAttachmentDataUrl,
  removeSessionAttachments,
  saveAttachment,
} from "@main/infra/storage/attachment-store";
import logger from "@main/infra/logger";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import {
  createRendererChatTurn,
  dispatchSpawnNotification,
} from "@main/services/session/chat/chat-turn-service";
import { spawnNotificationService } from "@main/services/session/spawn/spawn-notification-service";
import { spawnedSessionManager } from "@main/services/session/spawn/spawned-session-manager";

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

export function setupSpawnNotificationBroadcast(manager: WorkspaceWindowManager): void {
  spawnNotificationService.setWakeHandler((workspaceId) => {
    manager.sendToWorkspace(workspaceId, SessionChatNotificationChannels.wake, { workspaceId });
  });
}

export function registerChatHandlers(): void {
  ipcMain.handle(SessionChatNotificationChannels.list, (event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(listSpawnNotificationsInputSchema, input);
      requireWorkspaceSender(event.sender, workspaceId);
      await spawnNotificationService.reconcileWorkspace(workspaceId, (record) =>
        spawnedSessionManager.isTurnLive(record)
      );
      return spawnNotificationService.list(workspaceId);
    })
  );

  ipcMain.handle(SessionChatNotificationChannels.dispatch, (event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, notificationId } = validate(dispatchSpawnNotificationInputSchema, input);
      requireWorkspaceSender(event.sender, workspaceId);
      return dispatchSpawnNotification(workspaceId, notificationId);
    })
  );

  ipcMain.handle(SessionChatChannels.listSessions, (_event, input: unknown) =>
    wrapHandler(async () => {
      const query = validate(listSessionsInputSchema, input);
      await resolveWorkspace(query.workspaceId);
      ensureLineageEventConsumer(query.workspaceId);
      return listSessions(query.workspaceId);
    })
  );

  ipcMain.handle(SessionChatChannels.searchSessions, (event, input: unknown) =>
    wrapHandler(async () => {
      const query = validate(searchSessionsInputSchema, input);
      requireWorkspaceSender(event.sender, query.workspaceId);
      return searchSessions(query.workspaceId, query.query);
    })
  );

  ipcMain.handle(SessionChatChannels.createSession, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createSessionInputSchema, input);
      const workspaceSnapshot = form.acpSessionId
        ? getProbeWorkspaceSnapshotForPromotion(
            form.workspaceId,
            form.agentId,
            form.acpSessionId,
            form.sessionMode
          )
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

  ipcMain.handle(SessionChatChannels.saveAttachment, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(saveAttachmentInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      await assertSessionBelongsToWorkspace(form.workspaceId, form.sessionId);
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

  ipcMain.handle(SessionChatChannels.readAttachmentDataUrl, (event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(readAttachmentDataUrlInputSchema, input);
      requireWorkspaceSender(event.sender, form.workspaceId);
      await assertSessionBelongsToWorkspace(form.workspaceId, form.sessionId);
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
      return ensureProbe(form.workspaceId, form.agentId, form.sessionMode, workspaceSnapshot);
    })
  );

  ipcMain.handle(SessionChatProbeChannels.close, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(probeCloseInputSchema, input);
      await closeProbe(form.workspaceId, form.agentId, form.sessionMode);
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
      userMessageId,
      prompt,
      acpSessionId,
    } = validate(streamMessageInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: SessionChatStreamChannels.streamPort,
      portPayload: { streamId },
      logTag: "chat",
      onReady: (sink) =>
        createRendererChatTurn(
          {
            sessionId,
            workspaceId,
            agentId: inputAgentId,
            ...(userMessageId ? { userMessageId } : {}),
            prompt,
            ...(acpSessionId ? { acpSessionId } : {}),
          },
          sink
        ),
    });
  });

  ipcMain.handle(SessionChatStreamChannels.streamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, sessionId } = validate(streamCancelInputSchema, input);
      sessionRegistry.cancel("chat", `${workspaceId}:${sessionId}`);
    })
  );
}
