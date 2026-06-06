import { ipcRenderer } from "electron";
import type { IpcResponse, MessageChunkData } from "@shared/types/ipc";
import { ChatChannels, ChatProbeChannels, ChatStreamChannels } from "@shared/types/channels";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, Session, Message } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import type { ProbeSnapshot } from "@shared/types/chat-probe";

type SessionPatch = Partial<Pick<Session, "title" | "agentId">>;
type ProbeConfigOptionInput = {
  agentId: string;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
};
type ProbeUpdatePayload = { agentId: string; snapshot: ProbeSnapshot | null };
export interface StreamCallbacks {
  onChunk: (data: MessageChunkData) => void;
  onDone: (data: { totalTokens: number }) => void;
  onError: (error: { code: string; message: string }) => void;
}

export const chatApi = {
  listSessions(query: {
    projectId: string;
    page?: number;
    limit?: number;
  }): Promise<IpcResponse<Session[]>> {
    return ipcRenderer.invoke(ChatChannels.listSessions, query);
  },

  createSession(input: {
    projectId: string;
    title: string;
    agentId?: string;
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
  }): Promise<IpcResponse<Session>> {
    return ipcRenderer.invoke(ChatChannels.createSession, input);
  },

  updateSession(id: string, patch: SessionPatch, projectId: string): Promise<IpcResponse<Session>> {
    return ipcRenderer.invoke(ChatChannels.updateSession, { id, patch, projectId });
  },

  removeSession(id: string, projectId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(ChatChannels.removeSession, { id, projectId });
  },

  loadMessages(sessionId: string, projectId: string): Promise<IpcResponse<Message[]>> {
    return ipcRenderer.invoke(ChatChannels.loadMessages, { sessionId, projectId });
  },

  persistMessage(
    sessionId: string,
    projectId: string,
    message: Message
  ): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(ChatChannels.persistMessage, { sessionId, projectId, message });
  },

  streamMessage(
    sessionId: string,
    projectId: string,
    agentId: string,
    parts: ChatPromptPart[],
    callbacks: StreamCallbacks,
    options?: { acpSessionId?: string }
  ): () => void {
    let port: MessagePort | null = null;
    let cancelled = false;

    // Invoke to trigger main to create MessagePort and start streaming
    void ipcRenderer
      .invoke(ChatStreamChannels.streamMessage, {
        sessionId,
        projectId,
        agentId,
        prompt: parts,
        ...(options?.acpSessionId ? { acpSessionId: options.acpSessionId } : {}),
      })
      .catch((error: unknown) => {
        callbacks.onError({
          code: "STREAM_INIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    // Receive the port from main
    ipcRenderer.once(ChatStreamChannels.streamPort, (event) => {
      port = event.ports[0] ?? null;
      if (!port) {
        return;
      }

      if (cancelled) {
        port.close();
        port = null;
        return;
      }

      port.onmessage = ({ data }) => {
        if (data.type === "chunk") callbacks.onChunk(data.data);
        else if (data.type === "done") callbacks.onDone(data.data);
        else if (data.type === "error") callbacks.onError(data.data);
      };
      port.start();
      // Signal main that onmessage is registered and we're ready to receive chunks
      port.postMessage({ type: "ready" });
    });

    return () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      void ipcRenderer.invoke(ChatStreamChannels.streamCancel, { sessionId });
      port?.close();
      port = null;
    };
  },

  saveAttachment(
    projectId: string,
    sessionId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): Promise<IpcResponse<{ uri: string; name: string; mimeType: string }>> {
    return ipcRenderer.invoke(ChatChannels.saveAttachment, {
      projectId,
      sessionId,
      fileName,
      mimeType,
      base64Data,
    });
  },

  readAttachmentDataUrl(uri: string, mediaType: string): Promise<IpcResponse<{ dataUrl: string }>> {
    return ipcRenderer.invoke(ChatChannels.readAttachmentDataUrl, {
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
    return ipcRenderer.invoke(ChatChannels.setConfigOption, input);
  },

  probeEnsure(input: { agentId: string; projectId: string }): Promise<IpcResponse<ProbeSnapshot>> {
    return ipcRenderer.invoke(ChatProbeChannels.ensure, input);
  },

  probeClose(input: { agentId: string }): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(ChatProbeChannels.close, input);
  },

  probeSetConfigOption(input: ProbeConfigOptionInput): Promise<IpcResponse<ProbeSnapshot>> {
    return ipcRenderer.invoke(ChatProbeChannels.setConfigOption, input);
  },

  onProbeUpdate(handler: (payload: ProbeUpdatePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: ProbeUpdatePayload): void => {
      handler(payload);
    };
    ipcRenderer.on(ChatProbeChannels.update, listener);
    return () => {
      ipcRenderer.off(ChatProbeChannels.update, listener);
    };
  },
};
