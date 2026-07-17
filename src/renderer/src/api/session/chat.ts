import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, Session, Message } from "@shared/types/chat";
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
  projectId: string;
  agentId: string;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
};

export const chatApi = {
  listSessions(query: {
    projectId: string;
    page?: number;
    limit?: number;
  }): Promise<IpcResponse<Session[]>> {
    return window.api.session.chat.listSessions(query);
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
    return window.api.session.chat.createSession(input);
  },

  updateSession(id: string, patch: SessionPatch, projectId: string): Promise<IpcResponse<Session>> {
    return window.api.session.chat.updateSession(id, patch, projectId);
  },

  removeSession(id: string, projectId: string): Promise<IpcResponse<void>> {
    return window.api.session.chat.removeSession(id, projectId);
  },

  loadMessages(sessionId: string, projectId: string): Promise<IpcResponse<Message[]>> {
    return window.api.session.chat.loadMessages(sessionId, projectId);
  },

  persistMessage(
    sessionId: string,
    projectId: string,
    message: Message
  ): Promise<IpcResponse<void>> {
    return window.api.session.chat.persistMessage(sessionId, projectId, message);
  },

  streamMessage(
    sessionId: string,
    projectId: string,
    agentId: string,
    parts: ChatPromptPart[],
    callbacks: StreamCallbacks,
    options?: { acpSessionId?: string }
  ): () => void {
    return window.api.session.chat.streamMessage(
      sessionId,
      projectId,
      agentId,
      parts,
      callbacks,
      options
    );
  },

  saveAttachment(
    projectId: string,
    sessionId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<IpcResponse<{ uri: string; name: string; mimeType: string }>> {
    return window.api.session.chat.saveAttachment(
      projectId,
      sessionId,
      fileName,
      mimeType,
      base64Data
    );
  },

  readAttachmentDataUrl(uri: string, mediaType: string): Promise<IpcResponse<{ dataUrl: string }>> {
    return window.api.session.chat.readAttachmentDataUrl(uri, mediaType);
  },

  setConfigOption(input: {
    projectId: string;
    sessionId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>> {
    return window.api.session.chat.setConfigOption(input);
  },

  probeEnsure(input: { agentId: string; projectId: string }): Promise<IpcResponse<ProbeSnapshot>> {
    return window.api.session.chat.probeEnsure(input);
  },

  probeClose(input: { projectId: string; agentId: string }): Promise<IpcResponse<void>> {
    return window.api.session.chat.probeClose(input);
  },

  probeSetConfigOption(input: ProbeConfigOptionInput): Promise<IpcResponse<ProbeSnapshot>> {
    return window.api.session.chat.probeSetConfigOption(input);
  },

  onProbeUpdate(
    handler: (payload: {
      projectId: string;
      agentId: string;
      snapshot: ProbeSnapshot | null;
    }) => void
  ): () => void {
    return window.api.session.chat.onProbeUpdate(handler);
  },
};
