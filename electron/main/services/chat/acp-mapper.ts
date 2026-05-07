import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@main/domain/chat/session-events";
import logger from "@main/infra/logger";

export function mapSessionUpdate(update: SessionUpdate): SessionEvent | null {
  logger.debug(`[acp-mapper] sessionUpdate: ${update.sessionUpdate} ${JSON.stringify(update)}`);

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type !== "text") return null;
      return { type: "text_delta", text: update.content.text };
    }

    case "tool_call": {
      const meta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined;
      const title = meta?.claudeCode?.toolName ?? update.title;
      const event: SessionEvent = {
        type: "tool_call_start",
        toolCallId: update.toolCallId,
        title,
        kind: update.kind ?? "other",
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "tool_call_update": {
      const status = update.status ?? "in_progress";
      if (status !== "in_progress" && status !== "completed" && status !== "failed") return null;

      const content =
        update.content
          ?.flatMap((c) =>
            c.type === "content" && c.content.type === "text" ? [c.content.text] : []
          )
          .join("") || undefined;

      const rawInput =
        update.rawInput != null
          ? (JSON.parse(JSON.stringify(update.rawInput)) as Record<string, unknown>)
          : undefined;

      const event: SessionEvent = {
        type: "tool_call_update",
        toolCallId: update.toolCallId,
        status,
        input: rawInput,
        content,
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "session_info_update": {
      const title = typeof update.title === "string" ? update.title.trim() : "";
      if (!title) return null;

      const event: SessionEvent = {
        type: "session_info_update",
        title,
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    default:
      logger.debug(`[acp-mapper] unhandled sessionUpdate type, skipping.`);
      return null;
  }
}
