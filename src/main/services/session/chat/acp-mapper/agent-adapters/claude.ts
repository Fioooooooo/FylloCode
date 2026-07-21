import { mcpCallTitle } from "./shared";
import { identityAcpAgentEventAdapter, type AcpAgentEventAdapter } from "./types";
import { extractTextContentBlocks } from "../update-normalizers";
import type {
  SubagentRunStatus,
  SubagentRunSummary,
  SubagentToolStats,
} from "@shared/types/stream-event";

const SUBAGENT_TOOL_STAT_KEYS = [
  "readCount",
  "searchCount",
  "bashCount",
  "editFileCount",
  "linesAdded",
  "linesRemoved",
  "otherToolCount",
] as const satisfies readonly (keyof SubagentToolStats)[];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function subagentStatus(value: unknown): SubagentRunStatus | undefined {
  return value === "in_progress" || value === "completed" || value === "failed" ? value : undefined;
}

function claudeCodeMeta(meta: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(meta)?.claudeCode);
}

function extractToolStats(value: unknown): SubagentToolStats | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const stats: SubagentToolStats = {};
  for (const key of SUBAGENT_TOOL_STAT_KEYS) {
    const count = nonNegativeNumber(record[key]);
    if (count !== undefined) {
      stats[key] = count;
    }
  }
  return Object.keys(stats).length > 0 ? stats : undefined;
}

function extractClaudeSubagentSummary(
  meta: unknown,
  rawInput: unknown,
  eventStatus: SubagentRunStatus
): SubagentRunSummary | undefined {
  const claudeCode = claudeCodeMeta(meta);
  if (claudeCode?.toolName !== "Agent") return undefined;

  const toolResponse = asRecord(claudeCode.toolResponse);
  const input = asRecord(rawInput);
  const responseStatus = subagentStatus(toolResponse?.status);
  const summary: SubagentRunSummary = {
    status: eventStatus === "in_progress" ? (responseStatus ?? eventStatus) : eventStatus,
  };

  const agentType = nonEmptyString(toolResponse?.agentType) ?? nonEmptyString(input?.subagent_type);
  const resolvedModel = nonEmptyString(toolResponse?.resolvedModel);
  const totalTokens = nonNegativeNumber(toolResponse?.totalTokens);
  const totalDurationMs = nonNegativeNumber(toolResponse?.totalDurationMs);
  const totalToolUseCount = nonNegativeNumber(toolResponse?.totalToolUseCount);
  const toolStats = extractToolStats(toolResponse?.toolStats);

  if (agentType !== undefined) summary.agentType = agentType;
  if (resolvedModel !== undefined) summary.resolvedModel = resolvedModel;
  if (totalTokens !== undefined) summary.totalTokens = totalTokens;
  if (totalDurationMs !== undefined) summary.totalDurationMs = totalDurationMs;
  if (totalToolUseCount !== undefined) summary.totalToolUseCount = totalToolUseCount;
  if (toolStats !== undefined) summary.toolStats = toolStats;
  return summary;
}

/**
 * Claude Code 把 MCP 工具标识编码为 mcp__server__tool；仅拆分首个双下划线，
 * 以保留 tool 名自身可能包含的双下划线。
 */
export function normalizeClaudeMcpTool(name: string): string {
  const rest = name.startsWith("mcp__") ? name.slice("mcp__".length) : null;
  if (rest === null) return name;

  const separator = rest.indexOf("__");
  if (separator <= 0 || separator >= rest.length - 2) return name;

  const server = rest.slice(0, separator);
  const tool = rest.slice(separator + 2);
  return `${server}/${tool}`;
}

/** Claude Code 用 parentToolUseId 表达子代理内嵌工具关系；ACP 公共字段没有对应结构。 */
function claudeParentToolCallId(meta: unknown): string | undefined {
  const parent = claudeCodeMeta(meta)?.parentToolUseId;
  return typeof parent === "string" && parent.length > 0 ? parent : undefined;
}

export const claudeAcpAgentEventAdapter: AcpAgentEventAdapter = {
  ...identityAcpAgentEventAdapter,

  mapToolCallStart: (update, event) => {
    // ACP title 是当前权威来源；不再让历史 _meta.claudeCode.toolName 覆盖多 Agent 基线。
    const rawToolName = event.toolName ?? update.title;
    const toolName = normalizeClaudeMcpTool(rawToolName);
    const mcpName = toolName !== rawToolName ? toolName : undefined;
    const subagent = extractClaudeSubagentSummary(update._meta, update.rawInput, "in_progress");
    return {
      ...event,
      toolName,
      title: mcpName ? mcpCallTitle(mcpName) : toolName,
      parentToolCallId: claudeParentToolCallId(update._meta),
      ...(subagent === undefined ? {} : { subagent }),
    };
  },

  mapToolCallUpdate: (update, event) => {
    const claudeCode = claudeCodeMeta(update._meta);
    const rawTitle = typeof update.title === "string" ? update.title : undefined;
    const normalizedTitle = rawTitle === undefined ? undefined : normalizeClaudeMcpTool(rawTitle);
    const mcpName =
      rawTitle !== undefined && normalizedTitle !== rawTitle ? normalizedTitle : undefined;
    const subagent = extractClaudeSubagentSummary(update._meta, update.rawInput, event.status);
    const agentContentBlocks =
      event.status === "completed" && claudeCode?.toolName === "Agent"
        ? extractTextContentBlocks(update.content)
        : [];
    const agentContent =
      agentContentBlocks.length > 0 ? agentContentBlocks.join("\n\n") : undefined;

    return {
      ...event,
      // 原生 update 的 title 常是命令或路径，不是稳定身份；仅 MCP 编码 title 可更新 toolName。
      // undefined 会让 MessageAssembler 保留 start 已建立的原生 toolName。
      toolName: mcpName,
      title: mcpName !== undefined ? mcpCallTitle(mcpName) : normalizedTitle,
      parentToolCallId: claudeParentToolCallId(update._meta),
      ...(agentContent === undefined ? {} : { content: agentContent }),
      ...(subagent === undefined ? {} : { subagent }),
    };
  },
};
