import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import type { Session, Message } from "@shared/types/chat";

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
    prompt: string,
    callbacks: StreamCallbacks
  ): () => void {
    return window.api.chat.streamMessage(sessionId, projectId, agentId, prompt, callbacks);
  },
};
