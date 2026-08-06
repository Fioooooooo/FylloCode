import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, ChatSessionMode, Session, Message } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { ProbeSnapshot } from "@shared/types/chat-probe";
import type { LineageTaskRef } from "@shared/types/lineage";

// Renderer-side wrapper for session:chat IPC. Keeps components/composables free of direct
// window.api usage and provides a typed, normalized surface.
type SessionPatch = Partial<Pick<Session, "title" | "agentId" | "isPinned">>;

export interface StreamError {
  code: string;
  message: string;
}

export interface StreamCallbacks {
  onChunk: (data: MessageChunkData) => void;
  onDone: (data: { totalTokens: number }) => void;
  onError: (error: StreamError) => void;
}

type ProbeConfigOptionInput = {
  workspaceId: string;
  agentId: string;
  sessionMode?: ChatSessionMode;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
};

export const chatApi = {
  listSessions(query: {
    workspaceId: string;
    page?: number;
    limit?: number;
  }): Promise<IpcResponse<Session[]>> {
    return window.api.session.chat.listSessions(query);
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
    return window.api.session.chat.createSession(input);
  },

  updateSession(
    id: string,
    patch: SessionPatch,
    workspaceId: string
  ): Promise<IpcResponse<Session>> {
    return window.api.session.chat.updateSession(id, patch, workspaceId);
  },

  removeSession(id: string, workspaceId: string): Promise<IpcResponse<void>> {
    return window.api.session.chat.removeSession(id, workspaceId);
  },

  loadMessages(sessionId: string, workspaceId: string): Promise<IpcResponse<Message[]>> {
    return window.api.session.chat.loadMessages(sessionId, workspaceId);
  },

  persistMessage(
    sessionId: string,
    workspaceId: string,
    message: Message
  ): Promise<IpcResponse<void>> {
    return window.api.session.chat.persistMessage(sessionId, workspaceId, message);
  },

  streamMessage(
    sessionId: string,
    workspaceId: string,
    agentId: string,
    parts: ChatPromptPart[],
    callbacks: StreamCallbacks,
    options?: { acpSessionId?: string }
  ): () => void {
    return window.api.session.chat.streamMessage(
      sessionId,
      workspaceId,
      agentId,
      parts,
      callbacks,
      options
    );
  },

  saveAttachment(
    workspaceId: string,
    sessionId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<IpcResponse<{ attachmentId: string; name: string; mimeType: string }>> {
    return window.api.session.chat.saveAttachment(
      workspaceId,
      sessionId,
      fileName,
      mimeType,
      base64Data
    );
  },

  readAttachmentDataUrl(
    workspaceId: string,
    sessionId: string,
    attachmentId: string,
    mediaType: string
  ): Promise<IpcResponse<{ dataUrl: string }>> {
    return window.api.session.chat.readAttachmentDataUrl(
      workspaceId,
      sessionId,
      attachmentId,
      mediaType
    );
  },

  setConfigOption(input: {
    workspaceId: string;
    sessionId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>> {
    return window.api.session.chat.setConfigOption(input);
  },

  probeEnsure(input: {
    agentId: string;
    workspaceId: string;
    sessionMode?: ChatSessionMode;
  }): Promise<IpcResponse<ProbeSnapshot>> {
    return window.api.session.chat.probeEnsure(input);
  },

  probeClose(input: {
    workspaceId: string;
    agentId: string;
    sessionMode?: ChatSessionMode;
  }): Promise<IpcResponse<void>> {
    return window.api.session.chat.probeClose(input);
  },

  probeSetConfigOption(input: ProbeConfigOptionInput): Promise<IpcResponse<ProbeSnapshot>> {
    return window.api.session.chat.probeSetConfigOption(input);
  },

  onProbeUpdate(
    handler: (payload: {
      workspaceId: string;
      agentId: string;
      sessionMode: ChatSessionMode;
      snapshot: ProbeSnapshot | null;
    }) => void
  ): () => void {
    return window.api.session.chat.onProbeUpdate(handler);
  },
};
