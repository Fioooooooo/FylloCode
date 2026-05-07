import type { SessionEvent } from "@main/chat-agent/types";
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
    case "session_info_update":
      return { kind: "session_info_update", title: ev.title };
    case "session_id_resolved":
    case "done":
    case "error":
      return null;
  }
}
