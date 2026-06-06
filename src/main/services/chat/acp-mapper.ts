import type { SessionConfigOption, SessionUpdate } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@main/domain/chat/session-events";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
} from "@shared/types/acp-config";
import type { AcpAvailableCommand, PlanEntry } from "@shared/types/chat";
import logger from "@main/infra/logger";

export function normalizeAvailableCommands(
  update: Extract<SessionUpdate, { sessionUpdate: "available_commands_update" }>
): AcpAvailableCommand[] {
  return update.availableCommands.map((command) => ({
    name: command.name,
    description: command.description,
    hint:
      command.input != null && typeof command.input.hint === "string"
        ? command.input.hint
        : undefined,
  }));
}

const PLAN_PRIORITIES: ReadonlySet<PlanEntry["priority"]> = new Set(["high", "medium", "low"]);
const PLAN_STATUSES: ReadonlySet<PlanEntry["status"]> = new Set([
  "pending",
  "in_progress",
  "completed",
]);

export function normalizePlanEntries(
  update: Extract<SessionUpdate, { sessionUpdate: "plan" }>
): PlanEntry[] {
  return update.entries.map((entry) => ({
    content: entry.content,
    priority: PLAN_PRIORITIES.has(entry.priority as PlanEntry["priority"])
      ? (entry.priority as PlanEntry["priority"])
      : "medium",
    status: PLAN_STATUSES.has(entry.status as PlanEntry["status"])
      ? (entry.status as PlanEntry["status"])
      : "pending",
  }));
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeSelectOptions(
  options: unknown
): AcpSessionConfigOptionValueItem[] | AcpSessionConfigOptionGroup[] {
  if (!Array.isArray(options)) return [];
  if (options.length === 0) return [];

  const isGrouped = options.every(
    (entry) => entry != null && typeof entry === "object" && "group" in entry
  );

  if (isGrouped) {
    return options.map((entry) => {
      const group = entry as {
        group: string;
        name: string;
        options?: Array<{ value: string; name: string; description?: string | null }>;
      };
      return {
        group: group.group,
        name: group.name,
        options: (group.options ?? []).map((item) => ({
          value: item.value,
          name: item.name,
          description: normalizeOptionalString(item.description),
        })),
      } satisfies AcpSessionConfigOptionGroup;
    });
  }

  return options.map((entry) => {
    const item = entry as { value: string; name: string; description?: string | null };
    return {
      value: item.value,
      name: item.name,
      description: normalizeOptionalString(item.description),
    } satisfies AcpSessionConfigOptionValueItem;
  });
}

export function normalizeAcpSessionConfigOptions(
  input: SessionConfigOption[] | null | undefined
): AcpSessionConfigOption[] {
  if (!Array.isArray(input)) return [];

  return input.map((raw) => {
    const base = {
      id: raw.id,
      name: raw.name,
      description: normalizeOptionalString(raw.description),
      category: normalizeOptionalString(raw.category),
    };

    if (raw.type === "boolean") {
      return {
        ...base,
        type: "boolean",
        currentValue: Boolean(raw.currentValue),
      };
    }

    return {
      ...base,
      type: "select",
      currentValue: String(raw.currentValue),
      options: normalizeSelectOptions(raw.options),
    };
  });
}

export function mapSessionUpdate(update: SessionUpdate): SessionEvent | null {
  logger.debug(`[acp-mapper] ← sessionUpdate: ${update.sessionUpdate} ${JSON.stringify(update)}`);

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type !== "text") return null;
      return { type: "text_delta", text: update.content.text };
    }

    case "agent_thought_chunk": {
      if (update.content.type !== "text") return null;

      const event: SessionEvent = { type: "reasoning_delta", text: update.content.text };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
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

    case "usage_update": {
      const event: SessionEvent = {
        type: "usage_update",
        used: update.used,
        size: update.size,
        cost: update.cost
          ? {
              amount: update.cost.amount,
              currency: update.cost.currency ?? "USD",
            }
          : undefined,
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "available_commands_update": {
      const event: SessionEvent = {
        type: "available_commands_update",
        commands: normalizeAvailableCommands(update),
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "plan": {
      const event: SessionEvent = {
        type: "plan_update",
        entries: normalizePlanEntries(update),
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

    case "config_option_update": {
      const event: SessionEvent = {
        type: "config_options_update",
        options: normalizeAcpSessionConfigOptions(update.configOptions),
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    default:
      logger.debug("[acp-mapper] → unhandled sessionUpdate type, skipping.");
      return null;
  }
}
