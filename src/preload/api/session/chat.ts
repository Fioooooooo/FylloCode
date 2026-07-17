import { ipcRenderer } from "electron";
import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import {
  SessionChatChannels,
  SessionChatProbeChannels,
  SessionChatStreamChannels,
} from "@shared/ipc/session/chat.channels";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, Session, Message } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { ProbeSnapshot } from "@shared/types/chat-probe";
import type { LineageTaskRef } from "@shared/types/lineage";

type SessionPatch = Partial<Pick<Session, "title" | "agentId" | "isPinned">>;
type ProbeConfigOptionInput = {
  projectId: string;
  agentId: string;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
};
type ProbeUpdatePayload = { projectId: string; agentId: string; snapshot: ProbeSnapshot | null };
export interface StreamCallbacks {
  onChunk: (data: MessageChunkData) => void;
  onDone: (data: { totalTokens: number }) => void;
  onError: (error: { code: string; message: string }) => void;
}

interface PendingChatStream {
  sessionId: string;
  projectId: string;
  callbacks: StreamCallbacks;
  port: MessagePort | null;
  cancelled: boolean;
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
  port.postMessage({ type: "ready" });
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
    projectId: string;
    page?: number;
    limit?: number;
  }): Promise<IpcResponse<Session[]>> {
    return ipcRenderer.invoke(SessionChatChannels.listSessions, query);
  },

  createSession(input: {
    projectId: string;
    title: string;
    agentId?: string;
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
    fylloSessionId?: string;
    taskRef?: LineageTaskRef;
  }): Promise<IpcResponse<Session>> {
    return ipcRenderer.invoke(SessionChatChannels.createSession, input);
  },

  updateSession(id: string, patch: SessionPatch, projectId: string): Promise<IpcResponse<Session>> {
    return ipcRenderer.invoke(SessionChatChannels.updateSession, { id, patch, projectId });
  },

  removeSession(id: string, projectId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(SessionChatChannels.removeSession, { id, projectId });
  },

  loadMessages(sessionId: string, projectId: string): Promise<IpcResponse<Message[]>> {
    return ipcRenderer.invoke(SessionChatChannels.loadMessages, { sessionId, projectId });
  },

  persistMessage(
    sessionId: string,
    projectId: string,
    message: Message
  ): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(SessionChatChannels.persistMessage, {
      sessionId,
      projectId,
      message,
    });
  },

  streamMessage(
    sessionId: string,
    projectId: string,
    agentId: string,
    parts: ChatPromptPart[],
    callbacks: StreamCallbacks,
    options?: { acpSessionId?: string }
  ): () => void {
    ensureStreamPortListener();

    const streamId = createStreamId();
    pendingChatStreams.set(streamId, {
      sessionId,
      projectId,
      callbacks,
      port: null,
      cancelled: false,
    });

    // Invoke to trigger main to create MessagePort and start streaming
    void ipcRenderer
      .invoke(SessionChatStreamChannels.streamMessage, {
        streamId,
        sessionId,
        projectId,
        agentId,
        prompt: parts,
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
      void ipcRenderer.invoke(SessionChatStreamChannels.streamCancel, { projectId, sessionId });
      closePort(pending.port);
      pendingChatStreams.delete(streamId);
    };
  },

  saveAttachment(
    projectId: string,
    sessionId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<IpcResponse<{ uri: string; name: string; mimeType: string }>> {
    return ipcRenderer.invoke(SessionChatChannels.saveAttachment, {
      projectId,
      sessionId,
      fileName,
      mimeType,
      base64Data,
    });
  },

  readAttachmentDataUrl(uri: string, mediaType: string): Promise<IpcResponse<{ dataUrl: string }>> {
    return ipcRenderer.invoke(SessionChatChannels.readAttachmentDataUrl, {
      uri,
      mediaType,
    });
  },

  setConfigOption(input: {
    projectId: string;
    sessionId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>> {
    return ipcRenderer.invoke(SessionChatChannels.setConfigOption, input);
  },

  probeEnsure(input: { agentId: string; projectId: string }): Promise<IpcResponse<ProbeSnapshot>> {
    return ipcRenderer.invoke(SessionChatProbeChannels.ensure, input);
  },

  probeClose(input: { projectId: string; agentId: string }): Promise<IpcResponse<void>> {
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
};
