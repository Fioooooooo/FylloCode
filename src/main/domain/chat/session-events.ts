import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, Message, PlanEntry } from "@shared/types/chat";

export type SessionEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call_start"; toolCallId: string; title: string; kind: string }
  | {
      type: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | {
      type: "usage_update";
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | { type: "session_info_update"; title: string }
  | { type: "available_commands_update"; commands: AcpAvailableCommand[] }
  | { type: "plan_update"; entries: PlanEntry[] }
  | { type: "config_options_update"; options: AcpSessionConfigOption[] }
  | { type: "done"; totalTokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "session_id_resolved"; acpSessionId: string };

export type { Message };
