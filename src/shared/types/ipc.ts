import type { IpcErrorCode } from "../constants/error-codes";
import type { MessageMeta } from "./chat";
import type { StreamContentEvent } from "./stream-event";
import type { UIMessage, ChatStatus } from "ai";

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
  | StreamContentEvent
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "status"; agentStatus: ChatStatus };

// Event push message type for ipcRenderer.on subscriptions
export interface EventMessage<T = unknown> {
  type: string;
  payload: T;
}
