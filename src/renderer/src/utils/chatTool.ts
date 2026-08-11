import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai";
import type { ToolCallDiff, ToolCallLocation, ToolCallStatus } from "@shared/types/stream-event";

export type ChatToolPart = DynamicToolUIPart | ToolUIPart<UITools>;
type ToolInput = Record<string, unknown>;
export type ToolKind = "read" | "write" | "edit" | "search" | "execute" | "other";
export interface ToolStatusPresentation {
  text: string;
  visible: boolean;
  leadingIconClass?: string;
}

const TOOL_KINDS = new Set<ToolKind>(["read", "write", "edit", "search", "execute", "other"]);
const TOOL_STATUSES = new Set<ToolCallStatus>(["pending", "in_progress", "completed", "failed"]);

const TOOL_STATUS_TEXT: Record<ToolCallStatus, string> = {
  pending: "等待执行",
  in_progress: "正在执行",
  completed: "已完成",
  failed: "失败",
};

const TOOL_KIND_ICONS: Record<ToolKind, string> = {
  read: "i-lucide-file-text",
  write: "i-lucide-file-plus",
  edit: "i-lucide-pencil",
  search: "i-lucide-search",
  execute: "i-lucide-square-terminal",
  other: "i-lucide-wrench",
};

function isDynamic(part: ChatToolPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

function asInput(part: DynamicToolUIPart): ToolInput {
  return (part.input ?? {}) as ToolInput;
}

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

function metadata(part: ChatToolPart): Record<string, unknown> {
  const value = part.toolMetadata;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getToolStatus(part: ChatToolPart): ToolCallStatus {
  const status = metadata(part).acpStatus;
  if (TOOL_STATUSES.has(status as ToolCallStatus)) return status as ToolCallStatus;
  if (part.state === "output-error") return "failed";
  if (part.state === "output-available") return "completed";
  return "in_progress";
}

export function getToolStatusText(part: ChatToolPart): string {
  return TOOL_STATUS_TEXT[getToolStatus(part)];
}

export function getToolStatusPresentation(part: ChatToolPart): ToolStatusPresentation {
  const status = getToolStatus(part);
  return {
    text: TOOL_STATUS_TEXT[status],
    visible: status === "failed",
    ...(status === "failed" ? { leadingIconClass: "text-error" } : {}),
  };
}

export function getToolError(part: ChatToolPart): string | null {
  return part.state === "output-error" ? formatToolValue(part.errorText) : null;
}

export function getToolDiffs(part: ChatToolPart): ToolCallDiff[] {
  const value = metadata(part).diff;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.path !== "string" || typeof candidate.newText !== "string") return [];
    if (candidate.oldText !== undefined && typeof candidate.oldText !== "string") return [];
    return [
      {
        path: candidate.path,
        newText: candidate.newText,
        ...(typeof candidate.oldText === "string" ? { oldText: candidate.oldText } : {}),
      },
    ];
  });
}

export function getToolLocations(part: ChatToolPart): ToolCallLocation[] {
  const value = metadata(part).locations;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.path !== "string") return [];
    if (candidate.line !== undefined && typeof candidate.line !== "number") return [];
    return [
      {
        path: candidate.path,
        ...(typeof candidate.line === "number" ? { line: candidate.line } : {}),
      },
    ];
  });
}

export function getToolKind(part: ChatToolPart): ToolKind {
  const rawKind = part.toolMetadata?.toolKind;
  if (typeof rawKind !== "string") return "other";

  const kind = rawKind.trim();
  return TOOL_KINDS.has(kind as ToolKind) ? (kind as ToolKind) : "other";
}

export function getToolIcon(part: ChatToolPart): string {
  return TOOL_KIND_ICONS[getToolKind(part)];
}

/**
 * Returns the display text for a tool part.
 * Format: "ToolName · description" (description only if present, dynamic tools only)
 */
export function getToolText(part: ChatToolPart): string {
  if (!isDynamic(part)) return String(part.type);
  const title = str(part.title);
  if (title) return title;
  const input = asInput(part);
  const description = str(input.description);
  return description ? `${part.toolName} · ${description}` : part.toolName;
}

function formatToolValue(value: unknown): string | null {
  if (value === undefined || value === "") return null;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return null;
  }
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function getToolInput(part: ChatToolPart): string | null {
  return formatToolValue(part.input);
}

/**
 * Returns the tool output string, or null if not yet available.
 */
export function getToolOutput(part: ChatToolPart): string | null {
  if (part.state === "output-available") {
    return formatToolValue(part.output);
  }

  const liveOutput = isDynamic(part) ? metadata(part).liveOutput : undefined;
  return typeof liveOutput === "string" && liveOutput.length > 0 ? liveOutput : null;
}
