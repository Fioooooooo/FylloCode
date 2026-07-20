import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai";

type AnyToolPart = DynamicToolUIPart | ToolUIPart<UITools>;
type ToolInput = Record<string, unknown>;
type ToolKind = "read" | "write" | "edit" | "search" | "execute" | "other";

const TOOL_KINDS = new Set<ToolKind>(["read", "write", "edit", "search", "execute", "other"]);

const TOOL_KIND_LABELS: Record<ToolKind, { verb: string; noun: string }> = {
  read: { verb: "Read", noun: "file" },
  write: { verb: "Write", noun: "file" },
  edit: { verb: "Edit", noun: "file" },
  search: { verb: "Search", noun: "tool" },
  execute: { verb: "Run", noun: "command" },
  other: { verb: "Run", noun: "tool" },
};

const TOOL_KIND_ICONS: Record<ToolKind, string> = {
  read: "i-lucide-file-text",
  write: "i-lucide-file-plus",
  edit: "i-lucide-pencil",
  search: "i-lucide-search",
  execute: "i-lucide-square-terminal",
  other: "i-lucide-wrench",
};

function isDynamic(part: AnyToolPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

function asInput(part: DynamicToolUIPart): ToolInput {
  return (part.input ?? {}) as ToolInput;
}

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

export function getToolKind(part: AnyToolPart): ToolKind {
  const rawKind = part.toolMetadata?.toolKind;
  if (typeof rawKind !== "string") return "other";

  const kind = rawKind.trim();
  return TOOL_KINDS.has(kind as ToolKind) ? (kind as ToolKind) : "other";
}

export function getToolIcon(part: AnyToolPart): string {
  return TOOL_KIND_ICONS[getToolKind(part)];
}

export function getToolGroupIcon(
  parts: AnyToolPart[],
  isStreamingPart: (part: AnyToolPart) => boolean
): string {
  const representative =
    [...parts].reverse().find((part) => isStreamingPart(part)) ?? parts[parts.length - 1];

  return representative ? getToolIcon(representative) : TOOL_KIND_ICONS.other;
}

export function summarizeToolGroup(parts: AnyToolPart[]): string {
  const counts = new Map<ToolKind, number>();

  for (const part of parts) {
    const kind = getToolKind(part);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([kind, count]) => {
      const label = TOOL_KIND_LABELS[kind];
      const noun = count === 1 ? label.noun : `${label.noun}s`;
      return `${label.verb} ${count} ${noun}`;
    })
    .join(", ");
}

/**
 * Returns the display text for a tool part.
 * Format: "ToolName · description" (description only if present, dynamic tools only)
 */
export function getToolText(part: AnyToolPart): string {
  if (!isDynamic(part)) return String(part.type);
  const title = str(part.title);
  if (title) return title;
  const input = asInput(part);
  const description = str(input.description);
  return description ? `${part.toolName} · ${description}` : part.toolName;
}

/**
 * Returns the suffix text for a tool part — the key parameter at a glance.
 */
export function getToolSuffix(part: AnyToolPart): string {
  if (!isDynamic(part)) return "";
  const input = asInput(part);
  switch (part.toolName) {
    case "Bash":
      return str(input.command);
    case "Read":
    case "Write":
    case "Edit":
      return str(input.file_path);
    case "Glob":
    case "Grep":
      return str(input.pattern);
    default:
      return "";
  }
}

/**
 * Returns the tool output string, or null if not yet available.
 */
export function getToolOutput(part: AnyToolPart): string | null {
  if (!isDynamic(part)) return null;
  if (part.state === "output-available") {
    const output = part.output;
    return typeof output === "string" ? output : JSON.stringify(output, null, 2);
  }

  const liveOutput = part.toolMetadata?.liveOutput;
  return typeof liveOutput === "string" && liveOutput.length > 0 ? liveOutput : null;
}
