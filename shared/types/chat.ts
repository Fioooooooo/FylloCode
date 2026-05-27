import type { UIMessage, ChatStatus } from "ai";
import type { AcpSessionConfigOption } from "./acp-config";
import type { ChatAgent } from "./chat-agent";

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
}

export type ProjectAgent = ChatAgent;
