import type { SessionConfigOption, SessionUpdate } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
} from "@shared/types/acp-config";
import type { AcpAvailableCommand, AgendaEntry } from "@shared/types/chat";
import type { ToolCallDiff, ToolCallLocation } from "@shared/types/stream-event";
import logger from "@main/infra/logger";

/**
 * 工具调用字段位置无关提取辅助函数组。
 *
 * ACP 协议规定 tool_call 字段（除 toolCallId/title 外）全部可选、且不规定出现时机：
 * `rawInput`/`content`/`locations` 可能出现在 `tool_call` start，也可能出现在
 * `tool_call_update`。以下函数对两个分支使用同一套提取规则，使未观测过的 agent
 * 也能正确提取，而无需 mapper 跨事件追踪状态。
 */

/** 深拷贝 rawInput 为普通对象（适配跨 MessagePort 序列化）；非对象返回 undefined。 */
export function extractToolInput(rawInput: unknown): Record<string, unknown> | undefined {
  if (rawInput == null || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(rawInput)) as Record<string, unknown>;
}

/** 拼合 content[] 中所有 text 类型 ContentBlock 的文本；无则 undefined。 */
export function extractTextContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .flatMap((c) =>
      c != null &&
      typeof c === "object" &&
      (c as { type?: unknown }).type === "content" &&
      (c as { content?: { type?: unknown } }).content?.type === "text"
        ? [(c as { content: { text: string } }).content.text]
        : []
    )
    .join("");
  return text || undefined;
}

/** 从 content[] 提取 type === "diff" 的项为 ToolCallDiff[]；无则 undefined。 */
export function extractDiffs(content: unknown): ToolCallDiff[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const diffs = content.flatMap((c) => {
    if (c == null || typeof c !== "object" || (c as { type?: unknown }).type !== "diff") {
      return [];
    }
    const item = c as { path?: unknown; newText?: unknown; oldText?: unknown };
    if (typeof item.path !== "string" || typeof item.newText !== "string") return [];
    return [
      {
        path: item.path,
        newText: item.newText,
        // ACP "null for new files" → undefined
        oldText: typeof item.oldText === "string" ? item.oldText : undefined,
      } satisfies ToolCallDiff,
    ];
  });
  return diffs.length > 0 ? diffs : undefined;
}

/** 从 locations[] 提取 ToolCallLocation[]；无则 undefined。 */
export function extractLocations(locations: unknown): ToolCallLocation[] | undefined {
  if (!Array.isArray(locations)) return undefined;
  const result = locations.flatMap((l) => {
    if (l == null || typeof l !== "object" || typeof (l as { path?: unknown }).path !== "string") {
      return [];
    }
    const item = l as { path: string; line?: unknown };
    return [
      {
        path: item.path,
        line: typeof item.line === "number" ? item.line : undefined,
      } satisfies ToolCallLocation,
    ];
  });
  return result.length > 0 ? result : undefined;
}

/**
 * qodercli 怪癖补丁：违反 ACP failed 语义。
 *
 * ACP 规定执行失败应为 `status: "failed"`，但 qodercli 的部分工具（如 Grep）失败时
 * 仍发 `status: "completed"`，将错误放在 `rawOutput.error`。此函数在该情形下把状态
 * 降级为 `"failed"`，并返回该 error 文本供 content 覆盖；其他情形保持原 status，errorText 为 undefined。
 * 非 codex/qodercli 形态不受影响。
 */
export function resolveStatus(
  status: "in_progress" | "completed" | "failed",
  rawOutput: unknown
): { status: "in_progress" | "completed" | "failed"; errorText?: string } {
  if (status === "completed" && rawOutput != null && typeof rawOutput === "object") {
    const error = (rawOutput as { error?: unknown }).error;
    if (typeof error === "string" && error.length > 0) {
      return { status: "failed", errorText: error };
    }
  }
  return { status };
}

/**
 * agent 怪癖补丁；非 codex 形态本期 fallback。
 *
 * 各 agent 的 MCP 工具展示标识格式不一（codex `"Tool: server/tool"`、gemini
 * `"guidelines (fyllo-cortex MCP Server)"`、opencode `"server_tool"`）。本函数仅依据
 * codex 形态的结构化 `rawInput`（`{ server, tool, arguments }`）可靠识别 MCP 工具，
 * 归一为 `"server/tool"`；识别失败（其他 agent 形态或非 MCP 工具）回退原 title。
 * 不解析 title 字符串，避免对 server/tool 名含分隔符的脆弱启发式。
 */
export function normalizeMcpTool(rawInput: unknown, title: string): string {
  if (rawInput != null && typeof rawInput === "object") {
    const candidate = rawInput as { server?: unknown; tool?: unknown };
    if (typeof candidate.server === "string" && typeof candidate.tool === "string") {
      return `${candidate.server}/${candidate.tool}`;
    }
  }
  return title;
}

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

const AGENDA_PRIORITIES: ReadonlySet<AgendaEntry["priority"]> = new Set(["high", "medium", "low"]);
const AGENDA_STATUSES: ReadonlySet<AgendaEntry["status"]> = new Set([
  "pending",
  "in_progress",
  "completed",
]);

export function normalizeAgendaEntries(
  update: Extract<SessionUpdate, { sessionUpdate: "plan" }>
): AgendaEntry[] {
  return update.entries.map((entry) => ({
    content: entry.content,
    priority: AGENDA_PRIORITIES.has(entry.priority as AgendaEntry["priority"])
      ? (entry.priority as AgendaEntry["priority"])
      : "medium",
    status: AGENDA_STATUSES.has(entry.status as AgendaEntry["status"])
      ? (entry.status as AgendaEntry["status"])
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
      return { kind: "text_delta", text: update.content.text };
    }

    case "agent_thought_chunk": {
      if (update.content.type !== "text") return null;

      const event: SessionEvent = { kind: "reasoning_delta", text: update.content.text };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "tool_call": {
      const meta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined;
      // title 优先 _meta.claudeCode.toolName；否则按 codex 形态 rawInput 归一 MCP 标识；再否则原 title。
      const title = meta?.claudeCode?.toolName ?? normalizeMcpTool(update.rawInput, update.title);
      const event: SessionEvent = {
        kind: "tool_call_start",
        toolCallId: update.toolCallId,
        title,
        toolKind: update.kind ?? "other",
        input: extractToolInput(update.rawInput),
        diff: extractDiffs(update.content),
        locations: extractLocations(update.locations),
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "tool_call_update": {
      const rawStatus = update.status ?? "in_progress";
      if (rawStatus !== "in_progress" && rawStatus !== "completed" && rawStatus !== "failed") {
        return null;
      }

      const { status, errorText } = resolveStatus(rawStatus, update.rawOutput);
      // 降级时用 error 文本作为 content；否则取 content[] 拼合文本。
      const content = errorText ?? extractTextContent(update.content);

      const event: SessionEvent = {
        kind: "tool_call_update",
        toolCallId: update.toolCallId,
        status,
        input: extractToolInput(update.rawInput),
        content,
        diff: extractDiffs(update.content),
        locations: extractLocations(update.locations),
        // 孤儿 update（gemini 跳过 start）补偿建卡所需：若 update 自带 title/kind 则透传。
        title: typeof update.title === "string" ? update.title : undefined,
        toolKind: typeof update.kind === "string" ? update.kind : undefined,
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "usage_update": {
      const event: SessionEvent = {
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
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "available_commands_update": {
      const event: SessionEvent = {
        kind: "available_commands_update",
        commands: normalizeAvailableCommands(update),
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "plan": {
      const event: SessionEvent = {
        kind: "agenda_update",
        entries: normalizeAgendaEntries(update),
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    // case "session_info_update": {
    // const title = typeof update.title === "string" ? update.title.trim() : "";
    // if (!title) return null;

    // const event: SessionEvent = {
    // kind: "session_info_update",
    // title,
    // };
    // logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
    // return event;
    // }

    case "config_option_update": {
      const event: SessionEvent = {
        kind: "config_options_update",
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
