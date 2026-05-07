import type { IpcErrorCode } from "../constants/error-codes";

export interface IpcErrorInfo {
  code: IpcErrorCode;
  message: string;
}

export type IpcResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: IpcErrorInfo };

// Stream message types sent over MessagePort
export type StreamMessage<T = unknown> =
  | { type: "chunk"; data: T }
  | { type: "done"; data: { totalTokens: number } }
  | { type: "error"; data: IpcErrorInfo };

export interface StreamChunkData {
  content: string;
  tokenCount: number;
}

export type MessageChunkData =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_call_start"; toolCallId: string; title: string; toolKind: string }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "status"; agentStatus: import("ai").ChatStatus };

// Event push message type for ipcRenderer.on subscriptions
export interface EventMessage<T = unknown> {
  type: string;
  payload: T;
}
