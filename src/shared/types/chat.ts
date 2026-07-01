import type { UIMessage, ChatStatus } from "ai";
import type { AcpSessionConfigOption } from "./acp-config";
import type { ChatAgent } from "./chat-agent";
import type { FylloActionState } from "./fyllo-action";
import type { LineageTaskRef } from "./lineage";

export type { ChatStatus };
export type ModeType = "auto" | "manual";
export type SidebarTab = "sessions";

export interface MessageMeta {
  sessionId: string;
  createdAt: Date;
}

export type Message = UIMessage<MessageMeta>;

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
  projectId: string;
  agentId: string;
  title: string;
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
  // 运行时态：ACP Agent 行动清单，全量替换、不持久化（不写入 session meta）。
  agentAgenda?: AgendaEntry[];
}

export type ProjectAgent = ChatAgent;
