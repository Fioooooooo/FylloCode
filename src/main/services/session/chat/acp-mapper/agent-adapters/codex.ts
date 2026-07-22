import { basename } from "path";
import { extractTextContent, normalizeMcpTool, resolveStatus } from "../update-normalizers";
import { mcpCallTitle } from "./shared";
import { identityAcpAgentEventAdapter, type AcpAgentEventAdapter } from "./types";

/**
 * Codex 会把仅含粗体的 thought chunk 当作阶段摘要，并穿插空白 chunk 作为分隔。
 * UI reasoning part 使用纯文本，因此去掉摘要的 Markdown 包裹并丢弃无内容分隔。
 */
export function normalizeCodexThought(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const summary = /^\*\*([^\n]+)\*\*$/.exec(trimmed);
  return summary ? `${summary[1].trim()}\n` : text;
}

/** Codex 的 ACP title 是本次动作描述；toolName 需按 kind 保持稳定，供工具卡片识别类型。 */
function codexNativeToolName(kind: unknown): string {
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

function codexToolName(rawInput: unknown, kind: unknown): string {
  return normalizeMcpTool(rawInput, "") || codexNativeToolName(kind);
}

/**
 * Codex 在 edit start 的 diff._meta.kind 中提供真实文件操作，但 title 通常只有泛化文案。
 * 只有全部 diff 都可可靠识别时才生成友好标题，避免部分识别造成误导。
 */
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

/** Codex 终端输出通过私有 meta 增量发送，而不是 ACP 标准 content block。 */
function codexTerminalOutputDelta(meta: unknown): string | undefined {
  if (meta == null || typeof meta !== "object") return undefined;
  const delta = (meta as { terminal_output_delta?: unknown }).terminal_output_delta;
  if (delta == null || typeof delta !== "object") return undefined;
  const data = (delta as { data?: unknown }).data;
  return typeof data === "string" && data.length > 0 ? data : undefined;
}

/** Codex 的终端结束事件可能省略 ACP status，只在该事件出现时用 exit code 补全终态。 */
function codexTerminalExitCode(meta: unknown): number | undefined {
  if (meta == null || typeof meta !== "object") return undefined;
  const terminalExit = (meta as { terminal_exit?: unknown }).terminal_exit;
  if (terminalExit == null || typeof terminalExit !== "object") return undefined;
  const exitCode = (terminalExit as { exit_code?: unknown }).exit_code;
  return typeof exitCode === "number" ? exitCode : undefined;
}

/** 提取 MCP CallToolResult 中按原始顺序返回的文本块。 */
function codexMcpTextContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .flatMap((item) => {
      if (item == null || typeof item !== "object") return [];
      const block = item as { type?: unknown; text?: unknown };
      return block.type === "text" && typeof block.text === "string" ? [block.text] : [];
    })
    .join("");
  return text || undefined;
}

/** Codex 工具终态可能只在 rawOutput 提供 MCP 结果或终端聚合输出。 */
function codexFinalOutput(rawOutput: unknown): string | undefined {
  if (rawOutput == null || typeof rawOutput !== "object") return undefined;
  const output = rawOutput as Record<string, unknown>;

  const result =
    output.result != null && typeof output.result === "object"
      ? (output.result as Record<string, unknown>)
      : undefined;
  const mcpOutput = codexMcpTextContent(result?.content) ?? codexMcpTextContent(output.content);
  if (mcpOutput) return mcpOutput;

  for (const key of ["formatted_output", "aggregated_output"]) {
    const value = output[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  const stdout = typeof output.stdout === "string" ? output.stdout : "";
  const stderr = typeof output.stderr === "string" ? output.stderr : "";
  const combined = [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");
  return combined || undefined;
}

export const codexAcpAgentEventAdapter: AcpAgentEventAdapter = {
  ...identityAcpAgentEventAdapter,

  mapThought: (_update, event) => {
    const text = normalizeCodexThought(event.text);
    return text === null ? null : { ...event, text };
  },

  mapToolCallStart: (update, event) => {
    const mcpName = normalizeMcpTool(update.rawInput, "");
    return {
      ...event,
      toolName: mcpName || codexNativeToolName(update.kind),
      title:
        mcpName !== ""
          ? mcpCallTitle(mcpName)
          : update.kind === "edit"
            ? codexEditTitle(update.content, update.title)
            : update.title,
    };
  },

  mapToolCallUpdate: (update, event) => {
    const terminalExitCode = codexTerminalExitCode(update._meta);
    // 显式 ACP status 始终优先；terminal_exit 只补偿 Codex 省略 status 的终态事件。
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
    const mcpName = normalizeMcpTool(update.rawInput, "");
    return {
      ...event,
      status,
      toolName:
        update.rawInput != null || update.kind != null
          ? codexToolName(update.rawInput, update.kind)
          : undefined,
      content:
        errorText ??
        extractTextContent(update.content) ??
        // 标准 content 不存在时，终态才回退 Codex 聚合输出，避免重复展示流式 delta。
        (status !== "in_progress" ? codexFinalOutput(update.rawOutput) : undefined),
      outputDelta: codexTerminalOutputDelta(update._meta),
      title: mcpName ? mcpCallTitle(mcpName) : event.title,
    };
  },
};
