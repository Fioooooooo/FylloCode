import type { SessionConfigOption, SessionUpdate } from "@agentclientprotocol/sdk";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
} from "@shared/types/acp-config";
import type { AcpAvailableCommand, AgendaEntry } from "@shared/types/chat";
import type { ToolCallDiff, ToolCallLocation } from "@shared/types/stream-event";

/** 深拷贝 rawInput 为普通对象（适配跨 MessagePort 序列化）；非对象返回 undefined。 */
export function extractToolInput(rawInput: unknown): Record<string, unknown> | undefined {
  if (rawInput == null || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(rawInput)) as Record<string, unknown>;
}

/** 按原始顺序提取 content[] 中所有 text 类型 ContentBlock。 */
export function extractTextContentBlocks(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (
      item == null ||
      typeof item !== "object" ||
      (item as { type?: unknown }).type !== "content"
    ) {
      return [];
    }
    const block = (item as { content?: { type?: unknown; text?: unknown } }).content;
    return block?.type === "text" && typeof block.text === "string" ? [block.text] : [];
  });
}

/** 拼合 content[] 中所有 text 类型 ContentBlock 的文本；无则 undefined。 */
export function extractTextContent(content: unknown): string | undefined {
  const text = extractTextContentBlocks(content).join("");
  return text || undefined;
}

/** 从 content[] 提取 type === "diff" 的项为 ToolCallDiff[]；无则 undefined。 */
export function extractDiffs(content: unknown): ToolCallDiff[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const diffs = content.flatMap((item) => {
    if (item == null || typeof item !== "object" || (item as { type?: unknown }).type !== "diff") {
      return [];
    }
    const diff = item as { path?: unknown; newText?: unknown; oldText?: unknown };
    if (typeof diff.path !== "string" || typeof diff.newText !== "string") return [];
    return [
      {
        path: diff.path,
        newText: diff.newText,
        // ACP 用 null 表示新文件，内部事件统一用 undefined。
        oldText: typeof diff.oldText === "string" ? diff.oldText : undefined,
      } satisfies ToolCallDiff,
    ];
  });
  return diffs.length > 0 ? diffs : undefined;
}

/** 从 locations[] 提取 ToolCallLocation[]；无则 undefined。 */
export function extractLocations(locations: unknown): ToolCallLocation[] | undefined {
  if (!Array.isArray(locations)) return undefined;
  const result = locations.flatMap((item) => {
    if (
      item == null ||
      typeof item !== "object" ||
      typeof (item as { path?: unknown }).path !== "string"
    ) {
      return [];
    }
    const location = item as { path: string; line?: unknown };
    return [
      {
        path: location.path,
        line: typeof location.line === "number" ? location.line : undefined,
      } satisfies ToolCallLocation,
    ];
  });
  return result.length > 0 ? result : undefined;
}

/**
 * 兼容把错误塞进 rawOutput.error、却上报 completed 的 Agent。
 *
 * 该修正只依赖 ACP 字段之间的矛盾，不依赖 Agent 身份，因此保留在协议基线层。
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
 * 从 Codex 结构化 rawInput 中提取 MCP 身份；无法可靠识别时回退 ACP title。
 * 不猜测其他 Agent 的 title 分隔格式，避免 server/tool 名包含分隔符时误判。
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
  if (!Array.isArray(options) || options.length === 0) return [];

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
