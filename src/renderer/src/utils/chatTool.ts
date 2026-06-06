import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai";

type AnyToolPart = DynamicToolUIPart | ToolUIPart<UITools>;
type ToolInput = Record<string, unknown>;

function isDynamic(part: AnyToolPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

function asInput(part: DynamicToolUIPart): ToolInput {
  return (part.input ?? {}) as ToolInput;
}

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

/**
 * Returns the display text for a tool part.
 * Format: "ToolName · description" (description only if present, dynamic tools only)
 */
export function getToolText(part: AnyToolPart): string {
  if (!isDynamic(part)) return String(part.type);
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
  if (!isDynamic(part) || part.state !== "output-available") return null;
  const output = part.output;
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}
