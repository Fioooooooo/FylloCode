import { mcpCallTitle } from "./shared";
import { identityAcpAgentEventAdapter, type AcpAgentEventAdapter } from "./types";

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
  if (meta == null || typeof meta !== "object") return undefined;
  const claudeCode = (meta as { claudeCode?: unknown }).claudeCode;
  if (claudeCode == null || typeof claudeCode !== "object") return undefined;
  const parent = (claudeCode as { parentToolUseId?: unknown }).parentToolUseId;
  return typeof parent === "string" && parent.length > 0 ? parent : undefined;
}

export const claudeAcpAgentEventAdapter: AcpAgentEventAdapter = {
  ...identityAcpAgentEventAdapter,

  mapToolCallStart: (update, event) => {
    // ACP title 是当前权威来源；不再让历史 _meta.claudeCode.toolName 覆盖多 Agent 基线。
    const rawToolName = event.toolName ?? update.title;
    const toolName = normalizeClaudeMcpTool(rawToolName);
    const mcpName = toolName !== rawToolName ? toolName : undefined;
    return {
      ...event,
      toolName,
      title: mcpName ? mcpCallTitle(mcpName) : toolName,
      parentToolCallId: claudeParentToolCallId(update._meta),
    };
  },

  mapToolCallUpdate: (update, event) => {
    const rawTitle = typeof update.title === "string" ? update.title : undefined;
    const normalizedTitle = rawTitle === undefined ? undefined : normalizeClaudeMcpTool(rawTitle);
    const mcpName =
      rawTitle !== undefined && normalizedTitle !== rawTitle ? normalizedTitle : undefined;

    return {
      ...event,
      // 原生 update 的 title 常是命令或路径，不是稳定身份；仅 MCP 编码 title 可更新 toolName。
      // undefined 会让 MessageAssembler 保留 start 已建立的原生 toolName。
      toolName: mcpName,
      title: mcpName !== undefined ? mcpCallTitle(mcpName) : normalizedTitle,
      parentToolCallId: claudeParentToolCallId(update._meta),
    };
  },
};
