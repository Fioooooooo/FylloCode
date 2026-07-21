import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import {
  extractDiffs,
  extractLocations,
  extractTextContent,
  extractToolInput,
  normalizeMcpTool,
  resolveStatus,
} from "./update-normalizers";

export type AcpToolCallStartUpdate = Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;
export type AcpToolCallUpdate = Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>;
export type ToolCallStartEvent = Extract<SessionEvent, { kind: "tool_call_start" }>;
export type ToolCallUpdateEvent = Extract<SessionEvent, { kind: "tool_call_update" }>;

/**
 * 创建仅依赖 ACP 公共字段的 tool-call start 基线。
 * Agent 特有的命名和展示增强由后续 adapter 处理。
 */
export function mapToolCallStart(update: AcpToolCallStartUpdate): ToolCallStartEvent {
  const toolName = normalizeMcpTool(update.rawInput, update.title);

  return {
    kind: "tool_call_start",
    toolCallId: update.toolCallId,
    toolName,
    title: toolName,
    toolKind: update.kind ?? "other",
    input: extractToolInput(update.rawInput),
    diff: extractDiffs(update.content),
    locations: extractLocations(update.locations),
  };
}

/**
 * 创建字段位置无关的 tool-call update 基线。
 * mapper 保持无状态，缺少 start 的更新由 MessageAssembler 惰性建卡。
 */
export function mapToolCallUpdate(update: AcpToolCallUpdate): ToolCallUpdateEvent | null {
  const rawStatus = update.status ?? "in_progress";
  if (rawStatus !== "in_progress" && rawStatus !== "completed" && rawStatus !== "failed") {
    return null;
  }

  const { status, errorText } = resolveStatus(rawStatus, update.rawOutput);
  return {
    kind: "tool_call_update",
    toolCallId: update.toolCallId,
    status,
    input: extractToolInput(update.rawInput),
    content: errorText ?? extractTextContent(update.content),
    diff: extractDiffs(update.content),
    locations: extractLocations(update.locations),
    // Gemini 等 Agent 可能跳过 start；保留这些字段供 assembler 惰性建卡。
    title: typeof update.title === "string" ? update.title : undefined,
    toolKind: typeof update.kind === "string" ? update.kind : undefined,
  };
}
