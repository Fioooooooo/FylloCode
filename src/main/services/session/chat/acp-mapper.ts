import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import logger from "@main/infra/logger";
import { resolveAcpAgentEventAdapter } from "./acp-mapper/agent-adapters/registry";
import { mapToolCallStart, mapToolCallUpdate } from "./acp-mapper/tool-call-mapper";
import {
  normalizeAcpSessionConfigOptions,
  normalizeAgendaEntries,
  normalizeAvailableCommands,
} from "./acp-mapper/update-normalizers";

export {
  normalizeAcpSessionConfigOptions,
  normalizeAvailableCommands,
} from "./acp-mapper/update-normalizers";

export interface SessionUpdateMappingContext {
  agentId?: string;
}

export function mapSessionUpdate(
  update: SessionUpdate,
  context: SessionUpdateMappingContext = {}
): SessionEvent | null {
  logger.debug(`[acp-mapper] ← sessionUpdate: ${update.sessionUpdate} ${JSON.stringify(update)}`);

  const adapter = resolveAcpAgentEventAdapter(context.agentId);
  let event: SessionEvent | null;

  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      event =
        update.content.type === "text" ? { kind: "text_delta", text: update.content.text } : null;
      break;

    case "agent_thought_chunk":
      event =
        update.content.type === "text"
          ? adapter.mapThought(update, {
              kind: "reasoning_delta",
              text: update.content.text,
            })
          : null;
      break;

    case "tool_call":
      event = adapter.mapToolCallStart(update, mapToolCallStart(update));
      break;

    case "tool_call_update": {
      const baseEvent = mapToolCallUpdate(update);
      event = baseEvent === null ? null : adapter.mapToolCallUpdate(update, baseEvent);
      break;
    }

    case "usage_update":
      event = {
        kind: "usage_update",
        used: update.used,
        size: update.size,
        cost: update.cost
          ? {
              amount: update.cost.amount,
              currency: update.cost.currency ?? "USD",
            }
          : undefined,
      };
      break;

    case "available_commands_update":
      event = {
        kind: "available_commands_update",
        commands: normalizeAvailableCommands(update),
      };
      break;

    case "plan":
      event = {
        kind: "agenda_update",
        entries: normalizeAgendaEntries(update),
      };
      break;

    // session_info_update 暂不进入内部事件；Agent 可能发送空标题或重复标题。
    case "config_option_update":
      event = {
        kind: "config_options_update",
        options: normalizeAcpSessionConfigOptions(update.configOptions),
      };
      break;

    default:
      logger.debug("[acp-mapper] → unhandled sessionUpdate type, skipping.");
      return null;
  }

  if (event !== null) {
    logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
  }
  return event;
}
