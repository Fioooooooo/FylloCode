import type { SessionConfigOption, SessionUpdate } from "@agentclientprotocol/sdk";
import { basename } from "path";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
} from "@shared/types/acp-config";
import type { AcpAvailableCommand, AgendaEntry } from "@shared/types/chat";
import type { ToolCallDiff, ToolCallLocation } from "@shared/types/stream-event";
import logger from "@main/infra/logger";

export interface SessionUpdateMappingContext {
  agentId?: string;
}

const CODEX_AGENT_IDS: ReadonlySet<string> = new Set(["codex", "codex-acp"]);

function isCodexAgent(context: SessionUpdateMappingContext): boolean {
  return typeof context.agentId === "string" && CODEX_AGENT_IDS.has(context.agentId);
}

const CLAUDE_AGENT_IDS: ReadonlySet<string> = new Set(["claude-acp", "claude"]);

function isClaudeAgent(context: SessionUpdateMappingContext): boolean {
  return typeof context.agentId === "string" && CLAUDE_AGENT_IDS.has(context.agentId);
}

/**
 * Claude Code MCP 工具标识归一。
 *
 * Claude Code 的 MCP 工具在 `_meta.claudeCode.toolName` 与 `title` 均为
 * `mcp__<server>__<tool>` 双下划线格式（如 `mcp__tavily__tavily_search`），
 * 与 codex 的结构化 `{server,tool}` 不同，需按字符串归一为 `server/tool`。
 * 按剥离 `mcp__` 前缀后的首个 `__` 划定 server 边界，tool 名自身含 `__` 时保留其余部分。
 * 非 `mcp__` 前缀（原生工具如 `Bash`）原样返回。
 */
export function normalizeClaudeMcpTool(name: string): string {
  const rest = name.startsWith("mcp__") ? name.slice("mcp__".length) : null;
  if (rest === null) return name;

  const sep = rest.indexOf("__");
  if (sep <= 0 || sep >= rest.length - 2) return name;

  const server = rest.slice(0, sep);
  const tool = rest.slice(sep + 2);
  return `${server}/${tool}`;
}

/** 提取 Claude Code 子代理内嵌工具的父 toolCallId（`_meta.claudeCode.parentToolUseId`）。 */
function claudeParentToolCallId(meta: unknown): string | undefined {
  if (meta == null || typeof meta !== "object") return undefined;
  const claudeCode = (meta as { claudeCode?: unknown }).claudeCode;
  if (claudeCode == null || typeof claudeCode !== "object") return undefined;
  const parent = (claudeCode as { parentToolUseId?: unknown }).parentToolUseId;
  return typeof parent === "string" && parent.length > 0 ? parent : undefined;
}

export function normalizeCodexThought(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const summary = /^\*\*([^\n]+)\*\*$/.exec(trimmed);
  return summary ? `${summary[1].trim()}\n` : text;
}

function codexToolName(rawInput: unknown, kind: unknown): string {
  const mcpName = normalizeMcpTool(rawInput, "");
  if (mcpName) return mcpName;

  switch (kind) {
    case "read":
      return "Read";
    case "write":
      return "Write";
    case "edit":
      return "Edit";
    case "search":
      return "Search";
    case "execute":
      return "Bash";
    default:
      return "Tool";
  }
}

function codexEditTitle(content: unknown, fallback: string): string {
  if (!Array.isArray(content)) return fallback;

  const rawDiffs = content.filter(
    (item) =>
      item != null && typeof item === "object" && (item as { type?: unknown }).type === "diff"
  );
  if (rawDiffs.length === 0) return fallback;

  const files = rawDiffs.map((item) => {
    const diff = item as { path?: unknown; _meta?: unknown };
    const meta =
      diff._meta != null && typeof diff._meta === "object"
        ? (diff._meta as { kind?: unknown })
        : null;
    const operation = meta?.kind;
    if (
      typeof diff.path !== "string" ||
      (operation !== "add" && operation !== "update" && operation !== "delete")
    ) {
      return null;
    }

    const filename = basename(diff.path);
    return filename ? { filename, operation } : null;
  });
  if (files.some((file) => file === null)) return fallback;

  const recognizedFiles = files as Array<{
    filename: string;
    operation: "add" | "update" | "delete";
  }>;
  const verbFor = (operation: "add" | "update" | "delete"): string => {
    if (operation === "add") return "Create";
    if (operation === "delete") return "Delete";
    return "Edit";
  };
  if (recognizedFiles.length === 1) {
    const [file] = recognizedFiles;
    return `${verbFor(file.operation)} ${file.filename}`;
  }

  const operation = recognizedFiles[0].operation;
  const sameOperation = recognizedFiles.every((file) => file.operation === operation);
  if (!sameOperation) return `Change ${recognizedFiles.length} files`;
  return `${verbFor(operation)} ${recognizedFiles.length} files`;
}

function codexTerminalOutputDelta(meta: unknown): string | undefined {
  if (meta == null || typeof meta !== "object") return undefined;
  const delta = (meta as { terminal_output_delta?: unknown }).terminal_output_delta;
  if (delta == null || typeof delta !== "object") return undefined;
  const data = (delta as { data?: unknown }).data;
  return typeof data === "string" && data.length > 0 ? data : undefined;
}

function codexTerminalExitCode(meta: unknown): number | undefined {
  if (meta == null || typeof meta !== "object") return undefined;
  const terminalExit = (meta as { terminal_exit?: unknown }).terminal_exit;
  if (terminalExit == null || typeof terminalExit !== "object") return undefined;
  const exitCode = (terminalExit as { exit_code?: unknown }).exit_code;
  return typeof exitCode === "number" ? exitCode : undefined;
}

function codexFinalOutput(rawOutput: unknown): string | undefined {
  if (rawOutput == null || typeof rawOutput !== "object") return undefined;
  const output = rawOutput as Record<string, unknown>;

  for (const key of ["formatted_output", "aggregated_output"]) {
    const value = output[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  const stdout = typeof output.stdout === "string" ? output.stdout : "";
  const stderr = typeof output.stderr === "string" ? output.stderr : "";
  const combined = [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");
  return combined || undefined;
}

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

export function mapSessionUpdate(
  update: SessionUpdate,
  context: SessionUpdateMappingContext = {}
): SessionEvent | null {
  logger.debug(`[acp-mapper] ← sessionUpdate: ${update.sessionUpdate} ${JSON.stringify(update)}`);

  const codex = isCodexAgent(context);
  const claude = isClaudeAgent(context);

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type !== "text") return null;
      return { kind: "text_delta", text: update.content.text };
    }

    case "agent_thought_chunk": {
      if (update.content.type !== "text") return null;

      const text = codex ? normalizeCodexThought(update.content.text) : update.content.text;
      if (text === null) return null;

      const event: SessionEvent = { kind: "reasoning_delta", text };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "tool_call": {
      const meta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined;
      // title 优先 _meta.claudeCode.toolName；否则按 codex 形态 rawInput 归一 MCP 标识；再否则原 title。
      const metaToolName =
        meta?.claudeCode?.toolName ?? normalizeMcpTool(update.rawInput, update.title);
      // claude：MCP 工具 `mcp__server__tool` 归一为 `server/tool`；原生工具原样。
      const normalizedTitle = claude ? normalizeClaudeMcpTool(metaToolName) : metaToolName;
      const codexTitle =
        update.kind === "edit" ? codexEditTitle(update.content, update.title) : update.title;
      const event: SessionEvent = {
        kind: "tool_call_start",
        toolCallId: update.toolCallId,
        toolName: codex ? codexToolName(update.rawInput, update.kind) : normalizedTitle,
        title: codex ? codexTitle : normalizedTitle,
        toolKind: update.kind ?? "other",
        input: extractToolInput(update.rawInput),
        diff: extractDiffs(update.content),
        locations: extractLocations(update.locations),
        parentToolCallId: claude ? claudeParentToolCallId(update._meta) : undefined,
      };
      logger.debug(`[acp-mapper] → ${JSON.stringify(event)}`);
      return event;
    }

    case "tool_call_update": {
      const terminalExitCode = codex ? codexTerminalExitCode(update._meta) : undefined;
      const rawStatus =
        update.status ??
        (terminalExitCode === undefined
          ? "in_progress"
          : terminalExitCode === 0
            ? "completed"
            : "failed");
      if (rawStatus !== "in_progress" && rawStatus !== "completed" && rawStatus !== "failed") {
        return null;
      }

      const { status, errorText } = resolveStatus(rawStatus, update.rawOutput);
      // 降级时用 error 文本作为 content；否则取 content[] 拼合文本。
      const content =
        errorText ??
        extractTextContent(update.content) ??
        (codex && status !== "in_progress" ? codexFinalOutput(update.rawOutput) : undefined);
      const outputDelta = codex ? codexTerminalOutputDelta(update._meta) : undefined;

      const claudeMeta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined;
      const claudeToolName =
        claude && typeof claudeMeta?.claudeCode?.toolName === "string"
          ? normalizeClaudeMcpTool(claudeMeta.claudeCode.toolName)
          : undefined;
      // claude 孤儿 update 的 title 若为 MCP 原始串同样归一；原生工具具体命令/路径原样。
      const rawTitle = typeof update.title === "string" ? update.title : undefined;
      const claudeTitle =
        claude && rawTitle !== undefined ? normalizeClaudeMcpTool(rawTitle) : rawTitle;

      const event: SessionEvent = {
        kind: "tool_call_update",
        toolCallId: update.toolCallId,
        status,
        toolName:
          codex && (update.rawInput != null || update.kind != null)
            ? codexToolName(update.rawInput, update.kind)
            : claudeToolName,
        input: extractToolInput(update.rawInput),
        content,
        outputDelta,
        diff: extractDiffs(update.content),
        locations: extractLocations(update.locations),
        // 孤儿 update（gemini 跳过 start）补偿建卡所需：若 update 自带 title/kind 则透传。
        title: claudeTitle,
        toolKind: typeof update.kind === "string" ? update.kind : undefined,
        parentToolCallId: claude ? claudeParentToolCallId(update._meta) : undefined,
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
