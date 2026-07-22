import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai";

export type ChatToolPart = DynamicToolUIPart | ToolUIPart<UITools>;
type ToolInput = Record<string, unknown>;
export type ToolKind = "read" | "write" | "edit" | "search" | "execute" | "other";

const TOOL_KINDS = new Set<ToolKind>(["read", "write", "edit", "search", "execute", "other"]);

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

  const liveOutput = isDynamic(part) ? part.toolMetadata?.liveOutput : undefined;
  return typeof liveOutput === "string" && liveOutput.length > 0 ? liveOutput : null;
}
