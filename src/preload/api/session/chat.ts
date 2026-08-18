import { ipcRenderer } from "electron";
import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import {
  SessionChatChannels,
  SessionChatNotificationChannels,
  SessionChatProbeChannels,
  SessionChatStreamChannels,
} from "@shared/ipc/session/chat.channels";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type {
  AcpAvailableCommand,
  ChatSessionMode,
  Message,
  Session,
  SessionSearchResult,
} from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { ProbeSnapshot } from "@shared/types/chat-probe";
import type { LineageTaskRef } from "@shared/types/lineage";
import type {
  SpawnNotificationDispatchResult,
  SpawnNotificationSummary,
} from "@shared/ipc/session/chat.schemas";

type SessionPatch = Partial<Pick<Session, "title" | "agentId" | "isPinned">>;
type ProbeConfigOptionInput = {
  workspaceId: string;
  agentId: string;
  sessionMode?: ChatSessionMode;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
};
type ProbeUpdatePayload = {
  workspaceId: string;
  agentId: string;
  sessionMode: ChatSessionMode;
  snapshot: ProbeSnapshot | null;
};
export interface StreamCallbacks {
  onChunk: (data: MessageChunkData) => void;
  onDone: (data: { totalTokens: number }) => void;
  onError: (error: { code: string; message: string }) => void;
}

export interface SpawnNotificationStreamCallbacks extends StreamCallbacks {
  /** dispatch 前置校验未通过（不会建立 port）。 */
  onRejected: (status: "not_pending" | "busy") => void;
  /** 已 claim、通道已建立；在 ready 握手发出前同步调用，供 renderer 先建立 stream state。 */
  onAccepted: () => void;
}

interface PendingChatStream {
  sessionId: string;
  workspaceId: string;
  callbacks: StreamCallbacks;
  port: MessagePort | null;
  cancelled: boolean;
  /** dispatch 流专用：invoke 确认 accepted 前不向 main 发送 ready 握手。 */
  deferReady?: boolean;
}

const pendingChatStreams = new Map<string, PendingChatStream>();
let streamPortListenerRegistered = false;
let nextStreamSequence = 0;

function createStreamId(): string {
  nextStreamSequence += 1;
  return `chat-stream-${Date.now()}-${nextStreamSequence}`;
}

function getPayloadStreamId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const streamId = (payload as { streamId?: unknown }).streamId;
  return typeof streamId === "string" && streamId.length > 0 ? streamId : null;
}

function closePort(port: MessagePort | null): void {
  try {
    port?.close();
  } catch {
    /* ignore */
  }
}

function bindStreamPort(streamId: string, port: MessagePort): void {
  const pending = pendingChatStreams.get(streamId);
  if (!pending) {
    closePort(port);
    return;
  }

  pending.port = port;
  if (pending.cancelled) {
    closePort(port);
    pendingChatStreams.delete(streamId);
    return;
  }

  port.onmessage = ({ data }) => {
    if (data.type === "chunk") {
      pending.callbacks.onChunk(data.data);
      return;
    }

    if (data.type === "done") {
      pending.callbacks.onDone(data.data);
      pendingChatStreams.delete(streamId);
      return;
    }

    if (data.type === "error") {
      pending.callbacks.onError(data.data);
      pendingChatStreams.delete(streamId);
    }
  };
  port.start();
  // dispatch 流在 accepted 确认前推迟 ready：保证 renderer 先建立 stream state，
  // main 侧的 turn 只在接受后才可能启动。
  if (!pending.deferReady) {
    port.postMessage({ type: "ready" });
  }
}

function ensureStreamPortListener(): void {
  if (streamPortListenerRegistered) {
    return;
  }

  ipcRenderer.on(SessionChatStreamChannels.streamPort, (event, payload: unknown) => {
    const port = event.ports[0] ?? null;
    if (!port) {
      return;
    }

    const streamId = getPayloadStreamId(payload);
    if (!streamId) {
      closePort(port);
      return;
    }

    bindStreamPort(streamId, port);
  });
  streamPortListenerRegistered = true;
}

export const chatApi = {
  listSessions(query: {
    workspaceId: string;
    page?: number;
    limit?: number;
  }): Promise<IpcResponse<Session[]>> {
    return ipcRenderer.invoke(SessionChatChannels.listSessions, query);
  },

  searchSessions(input: {
    workspaceId: string;
    query: string;
  }): Promise<IpcResponse<SessionSearchResult[]>> {
    return ipcRenderer.invoke(SessionChatChannels.searchSessions, input);
  },

  createSession(input: {
    workspaceId: string;
    title: string;
    agentId?: string;
    sessionMode: ChatSessionMode;
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
    fylloSessionId?: string;
    taskRef?: LineageTaskRef;
  }): Promise<IpcResponse<Session>> {
    return ipcRenderer.invoke(SessionChatChannels.createSession, input);
  },

  updateSession(
    id: string,
    patch: SessionPatch,
    workspaceId: string
  ): Promise<IpcResponse<Session>> {
    return ipcRenderer.invoke(SessionChatChannels.updateSession, { id, patch, workspaceId });
  },

  removeSession(id: string, workspaceId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(SessionChatChannels.removeSession, { id, workspaceId });
  },

  loadMessages(sessionId: string, workspaceId: string): Promise<IpcResponse<Message[]>> {
    return ipcRenderer.invoke(SessionChatChannels.loadMessages, { sessionId, workspaceId });
  },

  persistMessage(
    sessionId: string,
    workspaceId: string,
    message: Message
  ): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(SessionChatChannels.persistMessage, {
      sessionId,
      workspaceId,
      message,
    });
  },

  streamMessage(
    sessionId: string,
    workspaceId: string,
    agentId: string,
    parts: ChatPromptPart[],
    callbacks: StreamCallbacks,
    options?: { acpSessionId?: string; userMessageId?: string }
  ): () => void {
    ensureStreamPortListener();

    const streamId = createStreamId();
    pendingChatStreams.set(streamId, {
      sessionId,
      workspaceId,
      callbacks,
      port: null,
      cancelled: false,
    });

    // Invoke to trigger main to create MessagePort and start streaming
    void ipcRenderer
      .invoke(SessionChatStreamChannels.streamMessage, {
        streamId,
        sessionId,
        workspaceId,
        agentId,
        prompt: parts,
        ...(options?.userMessageId ? { userMessageId: options.userMessageId } : {}),
        ...(options?.acpSessionId ? { acpSessionId: options.acpSessionId } : {}),
      })
      .catch((error: unknown) => {
        const pending = pendingChatStreams.get(streamId);
        pendingChatStreams.delete(streamId);
        closePort(pending?.port ?? null);
        if (pending?.cancelled) {
          return;
        }

        pending?.callbacks.onError({
          code: "STREAM_INIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    // Cancel handler: notify main to stop streaming and close the MessagePort.
    return () => {
      const pending = pendingChatStreams.get(streamId);
      if (!pending || pending.cancelled) {
        return;
      }

      pending.cancelled = true;
      void ipcRenderer.invoke(SessionChatStreamChannels.streamCancel, { workspaceId, sessionId });
      closePort(pending.port);
      pendingChatStreams.delete(streamId);
    };
  },

  saveAttachment(
    workspaceId: string,
    sessionId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<IpcResponse<{ attachmentId: string; name: string; mimeType: string }>> {
    return ipcRenderer.invoke(SessionChatChannels.saveAttachment, {
      workspaceId,
      sessionId,
      fileName,
      mimeType,
      base64Data,
    });
  },

  readAttachmentDataUrl(
    workspaceId: string,
    sessionId: string,
    attachmentId: string,
    mediaType: string
  ): Promise<IpcResponse<{ dataUrl: string }>> {
    return ipcRenderer.invoke(SessionChatChannels.readAttachmentDataUrl, {
      workspaceId,
      sessionId,
      attachmentId,
      mediaType,
    });
  },

  setConfigOption(input: {
    workspaceId: string;
    sessionId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>> {
    return ipcRenderer.invoke(SessionChatChannels.setConfigOption, input);
  },

  probeEnsure(input: {
    agentId: string;
    workspaceId: string;
    sessionMode?: ChatSessionMode;
  }): Promise<IpcResponse<ProbeSnapshot>> {
    return ipcRenderer.invoke(SessionChatProbeChannels.ensure, input);
  },

  probeClose(input: {
    workspaceId: string;
    agentId: string;
    sessionMode?: ChatSessionMode;
  }): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(SessionChatProbeChannels.close, input);
  },

  probeSetConfigOption(input: ProbeConfigOptionInput): Promise<IpcResponse<ProbeSnapshot>> {
    return ipcRenderer.invoke(SessionChatProbeChannels.setConfigOption, input);
  },

  onProbeUpdate(handler: (payload: ProbeUpdatePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: ProbeUpdatePayload): void => {
      handler(payload);
    };
    ipcRenderer.on(SessionChatProbeChannels.update, listener);
    return () => {
      ipcRenderer.off(SessionChatProbeChannels.update, listener);
    };
  },

  listSpawnNotifications(workspaceId: string): Promise<IpcResponse<SpawnNotificationSummary[]>> {
    return ipcRenderer.invoke(SessionChatNotificationChannels.list, { workspaceId });
  },

  dispatchSpawnNotification(
    workspaceId: string,
    notificationId: string,
    parentSessionId: string,
    callbacks: SpawnNotificationStreamCallbacks
  ): () => void {
    ensureStreamPortListener();

    const streamId = createStreamId();
    pendingChatStreams.set(streamId, {
      sessionId: parentSessionId,
      workspaceId,
      callbacks,
      port: null,
      cancelled: false,
      deferReady: true,
    });

    void ipcRenderer
      .invoke(SessionChatNotificationChannels.dispatch, { workspaceId, notificationId, streamId })
      .then((response: IpcResponse<SpawnNotificationDispatchResult>) => {
        const pending = pendingChatStreams.get(streamId);
        if (!pending) return;
        if (!response.ok) {
          pendingChatStreams.delete(streamId);
          closePort(pending.port);
          if (!pending.cancelled) {
            pending.callbacks.onError({
              code: response.error.code,
              message: response.error.message,
            });
          }
          return;
        }
        if (response.data.status !== "accepted") {
          // busy / not_pending：main 未创建 port，直接清理并通知 renderer。
          pendingChatStreams.delete(streamId);
          closePort(pending.port);
          if (!pending.cancelled) {
            (pending.callbacks as SpawnNotificationStreamCallbacks).onRejected(
              response.data.status
            );
          }
          return;
        }
        // accepted：先让 renderer 建立 stream state，再补发被 defer 的 ready 握手。
        pending.deferReady = false;
        (pending.callbacks as SpawnNotificationStreamCallbacks).onAccepted();
        pending.port?.postMessage({ type: "ready" });
      })
      .catch((error: unknown) => {
        const pending = pendingChatStreams.get(streamId);
        pendingChatStreams.delete(streamId);
        closePort(pending?.port ?? null);
        if (pending?.cancelled) {
          return;
        }

        pending?.callbacks.onError({
          code: "STREAM_INIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    // Cancel handler: notify main to stop streaming and close the MessagePort.
    return () => {
      const pending = pendingChatStreams.get(streamId);
      if (!pending || pending.cancelled) {
        return;
      }

      pending.cancelled = true;
      void ipcRenderer.invoke(SessionChatStreamChannels.streamCancel, {
        workspaceId,
        sessionId: parentSessionId,
      });
      closePort(pending.port);
      pendingChatStreams.delete(streamId);
    };
  },

  onSpawnNotificationsWake(handler: (payload: { workspaceId: string }) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { workspaceId: string }
    ): void => {
      handler(payload);
    };
    ipcRenderer.on(SessionChatNotificationChannels.wake, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.off(SessionChatNotificationChannels.wake, listener);
    };
  },
};
