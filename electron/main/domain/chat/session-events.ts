import type { Message } from "@shared/types/chat";

export type SessionEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; toolCallId: string; title: string; kind: string }
  | {
      type: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | { type: "session_info_update"; title: string }
  | { type: "done"; totalTokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "session_id_resolved"; acpSessionId: string };

export type { Message };
