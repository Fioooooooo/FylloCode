import type { UIMessage, ChatStatus } from "ai";
import type { AcpSessionConfigOption } from "./acp-config";
import type { FylloActionState } from "@shared/fyllo-action/protocol";
import type { LineageTaskRef } from "./lineage";
import type { SessionWorkspaceSnapshot } from "./workspace";

export type { ChatStatus };
export type ModeType = "auto" | "manual";
export type SidebarTab = "sessions";
export const CHAT_SESSION_MODES = ["fyllocode", "native"] as const;
export type ChatSessionMode = (typeof CHAT_SESSION_MODES)[number];
export const DEFAULT_CHAT_SESSION_MODE: ChatSessionMode = "fyllocode";

export function isChatSessionMode(value: unknown): value is ChatSessionMode {
  return value === "fyllocode" || value === "native";
}

export interface MessageMeta {
  sessionId: string;
  createdAt: Date;
  updatedAt?: Date;
  model?: string;
  effort?: string;
}

export type Message = UIMessage<MessageMeta>;

export type SessionSearchMatchKind = "title" | "session-id" | "message";

export interface SessionSearchResult {
  sessionId: string;
  title: string;
  updatedAt: Date;
  matchKind: SessionSearchMatchKind;
  snippet?: string;
}

export interface TokenUsage {
  used: number;
  size: number;
  cost?: {
    amount: number;
    currency: string;
  };
}

export interface AcpAvailableCommand {
  name: string;
  description: string;
  hint?: string;
}

export interface AgendaEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

export interface Session {
  id: string;
  workspaceId: string;
  agentId: string;
  sessionMode: ChatSessionMode;
  title: string;
  isPinned: boolean;
  status: "running" | "ended";
  turnCount: number;
  tokenUsage: TokenUsage;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  availableCommands?: AcpAvailableCommand[];
  configOptions?: AcpSessionConfigOption[];
  actionStates?: Record<string, FylloActionState>;
  originTaskRef?: LineageTaskRef;
  workspaceSnapshot?: SessionWorkspaceSnapshot;
  // 运行时态：ACP Agent 行动清单，全量替换、不持久化（不写入 session meta）。
  agentAgenda?: AgendaEntry[];
}
