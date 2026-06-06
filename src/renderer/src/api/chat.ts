import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { Session, Message } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { ProbeSnapshot } from "@shared/types/chat-probe";

type SessionPatch = Partial<Pick<Session, "title" | "agentId">>;

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
    return window.api.chat.listSessions(query);
  },

  createSession(input: {
    projectId: string;
    title: string;
    agentId?: string;
    configOptions?: AcpSessionConfigOption[];
    acpSessionId?: string;
  }): Promise<IpcResponse<Session>> {
    return window.api.chat.createSession(input);
  },

  updateSession(id: string, patch: SessionPatch, projectId: string): Promise<IpcResponse<Session>> {
    return window.api.chat.updateSession(id, patch, projectId);
  },

  removeSession(id: string, projectId: string): Promise<IpcResponse<void>> {
    return window.api.chat.removeSession(id, projectId);
  },

  loadMessages(sessionId: string, projectId: string): Promise<IpcResponse<Message[]>> {
    return window.api.chat.loadMessages(sessionId, projectId);
  },

  persistMessage(
    sessionId: string,
    projectId: string,
    message: Message
  ): Promise<IpcResponse<void>> {
    return window.api.chat.persistMessage(sessionId, projectId, message);
  },

  streamMessage(
    sessionId: string,
    projectId: string,
    agentId: string,
    parts: ChatPromptPart[],
    callbacks: StreamCallbacks,
    options?: { acpSessionId?: string }
  ): () => void {
    return window.api.chat.streamMessage(sessionId, projectId, agentId, parts, callbacks, options);
  },

  saveAttachment(
    projectId: string,
    sessionId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<IpcResponse<{ uri: string; name: string; mimeType: string }>> {
    return window.api.chat.saveAttachment(projectId, sessionId, fileName, mimeType, base64Data);
  },

  readAttachmentDataUrl(uri: string, mediaType: string): Promise<IpcResponse<{ dataUrl: string }>> {
    return window.api.chat.readAttachmentDataUrl(uri, mediaType);
  },

  setConfigOption(input: {
    projectId: string;
    sessionId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>> {
    return window.api.chat.setConfigOption(input);
  },

  probeEnsure(input: { agentId: string; projectId: string }): Promise<IpcResponse<ProbeSnapshot>> {
    return window.api.chat.probeEnsure(input);
  },

  probeClose(input: { agentId: string }): Promise<IpcResponse<void>> {
    return window.api.chat.probeClose(input);
  },

  probeSetConfigOption(input: ProbeConfigOptionInput): Promise<IpcResponse<ProbeSnapshot>> {
    return window.api.chat.probeSetConfigOption(input);
  },

  onProbeUpdate(
    handler: (payload: { agentId: string; snapshot: ProbeSnapshot | null }) => void
  ): () => void {
    return window.api.chat.onProbeUpdate(handler);
  },
};
