import type { SessionEvent } from "@main/domain/chat/session-events";
import type { MessageChunkData } from "@shared/types/ipc";

/**
 * Map an ACP session event to the renderer-facing stream chunk representation.
 *
 * Returns `null` for events that should not be forwarded as chunks (e.g.
 * terminal `done`/`error`, internal `session_id_resolved`).
 */
export function toMessageChunk(ev: SessionEvent): MessageChunkData | null {
  switch (ev.type) {
    case "text_delta":
      return { kind: "text_delta", text: ev.text };
    case "reasoning_delta":
      return { kind: "reasoning_delta", text: ev.text };
    case "tool_call_start":
      return {
        kind: "tool_call_start",
        toolCallId: ev.toolCallId,
        title: ev.title,
        toolKind: ev.kind,
      };
    case "tool_call_update":
      return {
        kind: "tool_call_update",
        toolCallId: ev.toolCallId,
        status: ev.status,
        input: ev.input
          ? (JSON.parse(JSON.stringify(ev.input)) as Record<string, unknown>)
          : undefined,
        content: ev.content,
      };
    case "usage_update":
      return { kind: "usage_update", used: ev.used, size: ev.size, cost: ev.cost };
    case "session_info_update":
      return { kind: "session_info_update", title: ev.title };
    case "available_commands_update":
      return { kind: "available_commands_update", commands: ev.commands };
    case "plan_update":
      return { kind: "plan_update", entries: ev.entries };
    case "config_options_update":
      return { kind: "config_options_update", options: ev.options };
    case "session_id_resolved":
    case "done":
    case "error":
      return null;
  }
}
