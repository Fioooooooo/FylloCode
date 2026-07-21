import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { mapSessionUpdate } from "@main/services/session/chat/acp-mapper";
import { normalizeClaudeMcpTool } from "@main/services/session/chat/acp-mapper/agent-adapters/claude";

describe("Claude Code ACP event adapter", () => {
  it("normalizes MCP identity for start and update", () => {
    const start = {
      sessionUpdate: "tool_call",
      toolCallId: "toolu_mcp",
      title: "mcp__tavily__tavily_search",
      kind: "other",
      rawInput: {},
    } as unknown as SessionUpdate;
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_mcp",
      status: "in_progress",
      title: "mcp__tavily__tavily_search",
      kind: "other",
      rawInput: { query: "acp" },
    } as unknown as SessionUpdate;

    for (const event of [
      mapSessionUpdate(start, { agentId: "claude" }),
      mapSessionUpdate(update, { agentId: "claude-acp" }),
    ]) {
      expect(event).toMatchObject({
        toolName: "tavily/tavily_search",
        title: "Call tavily/tavily_search",
      });
    }
  });

  it("preserves native command titles without reading legacy toolName metadata", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_bash",
      status: "in_progress",
      title: "ls -la /tmp",
      kind: "execute",
      rawInput: { command: "ls -la /tmp" },
      _meta: { claudeCode: { toolName: "Bash" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
      toolName: undefined,
      title: "ls -la /tmp",
    });
  });

  it("extracts parentToolUseId only for registered Claude agents", () => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "toolu_child",
      title: "Read foo.txt",
      kind: "read",
      rawInput: { file_path: "/foo.txt" },
      _meta: { claudeCode: { toolName: "Read", parentToolUseId: "toolu_parent" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
      parentToolCallId: "toolu_parent",
    });
    expect(mapSessionUpdate(update, { agentId: "gemini" })).not.toHaveProperty("parentToolCallId");
  });

  it("does not let Claude-shaped metadata override another Agent's ACP title", () => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "call_other",
      title: "Canonical ACP title",
      kind: "other",
      rawInput: {},
      _meta: { claudeCode: { toolName: "mcp__tavily__tavily_search" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "gemini" })).toMatchObject({
      toolName: "Canonical ACP title",
      title: "Canonical ACP title",
    });
  });

  it("marks Claude Agent tools before child tools or statistics arrive", () => {
    const start = {
      sessionUpdate: "tool_call",
      toolCallId: "toolu_parent",
      title: "Task",
      kind: "think",
      rawInput: {},
      _meta: { claudeCode: { toolName: "Agent" } },
    } as unknown as SessionUpdate;
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_parent",
      status: "in_progress",
      title: "定位 ACP 事件映射相关代码",
      kind: "think",
      rawInput: { subagent_type: "Explore" },
      _meta: { claudeCode: { toolName: "Agent" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(start, { agentId: "claude-acp" })).toMatchObject({
      subagent: { status: "in_progress" },
    });
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
      subagent: { status: "in_progress", agentType: "Explore" },
    });
  });

  it("whitelists Claude Agent toolResponse statistics from a stats-only update", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_parent",
      _meta: {
        claudeCode: {
          toolName: "Agent",
          toolResponse: {
            status: "completed",
            agentId: "internal-id",
            agentType: "Explore",
            resolvedModel: "claude-sonnet-5",
            totalTokens: 37556,
            totalDurationMs: 28471,
            totalToolUseCount: 5,
            usage: { input_tokens: 1 },
            unknownMetric: 99,
            toolStats: {
              readCount: 0,
              searchCount: 0,
              bashCount: 5,
              editFileCount: 0,
              linesAdded: 0,
              linesRemoved: 0,
              otherToolCount: 0,
              unknownCount: 7,
            },
          },
        },
      },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
      status: "in_progress",
      subagent: {
        status: "completed",
        agentType: "Explore",
        resolvedModel: "claude-sonnet-5",
        totalTokens: 37556,
        totalDurationMs: 28471,
        totalToolUseCount: 5,
        toolStats: {
          readCount: 0,
          searchCount: 0,
          bashCount: 5,
          editFileCount: 0,
          linesAdded: 0,
          linesRemoved: 0,
          otherToolCount: 0,
        },
      },
    });
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty(
      "subagent.agentId"
    );
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty(
      "subagent.usage"
    );
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty(
      "subagent.unknownMetric"
    );
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty(
      "subagent.toolStats.unknownCount"
    );
  });

  it("lets terminal ACP status override invalid or stale toolResponse values", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_parent",
      status: "failed",
      _meta: {
        claudeCode: {
          toolName: "Agent",
          toolResponse: {
            status: "completed",
            resolvedModel: " ",
            totalTokens: -1,
            totalDurationMs: Number.POSITIVE_INFINITY,
            totalToolUseCount: "5",
            toolStats: { bashCount: -2, readCount: "1" },
          },
        },
      },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
      subagent: { status: "failed" },
    });
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty(
      "subagent.totalTokens"
    );
    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty(
      "subagent.toolStats"
    );
  });

  it("preserves completed Agent content blocks with markdown paragraph boundaries", () => {
    const footer =
      "agentId: a3a95994cd5624e47 (use SendMessage with to: 'a3a95994cd5624e47', summary: '<5-10 word recap>' to continue this agent)\n" +
      "<usage>subagent_tokens: 57737\ntool_uses: 7\nduration_ms: 61417</usage>";
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_parent",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "统计与抽样已完成。" } },
        { type: "content", content: { type: "text", text: footer } },
      ],
      _meta: { claudeCode: { toolName: "Agent" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
      content: `统计与抽样已完成。\n\n${footer}`,
      subagent: { status: "completed" },
    });
  });

  it("keeps single-block Agent content and non-Agent joining behavior unchanged", () => {
    const agentUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_parent",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "single result" } }],
      _meta: { claudeCode: { toolName: "Agent" } },
    } as unknown as SessionUpdate;
    const bashUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_bash",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "first" } },
        { type: "content", content: { type: "text", text: "second" } },
      ],
      _meta: { claudeCode: { toolName: "Bash" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(agentUpdate, { agentId: "claude-acp" })).toMatchObject({
      content: "single result",
    });
    expect(mapSessionUpdate(bashUpdate, { agentId: "claude-acp" })).toMatchObject({
      content: "firstsecond",
    });
  });

  it("ignores string toolResponse and Agent metadata outside the Claude adapter", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_mcp",
      status: "in_progress",
      title: "mcp__server__tool",
      _meta: {
        claudeCode: { toolName: "mcp__server__tool", toolResponse: "raw response" },
      },
    } as unknown as SessionUpdate;
    const agentUpdate = {
      ...update,
      toolCallId: "toolu_agent",
      title: "Task",
      _meta: { claudeCode: { toolName: "Agent" } },
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "claude-acp" })).not.toHaveProperty("subagent");
    expect(mapSessionUpdate(agentUpdate, { agentId: "gemini" })).not.toHaveProperty("subagent");
  });
});

describe("normalizeClaudeMcpTool", () => {
  it.each([
    ["mcp__tavily__tavily_search", "tavily/tavily_search"],
    ["mcp__fyllo_specs__create_proposal", "fyllo_specs/create_proposal"],
    ["Bash", "Bash"],
    ["mcp__onlyserver", "mcp__onlyserver"],
    ["mcp____tool", "mcp____tool"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeClaudeMcpTool(input)).toBe(expected);
  });
});
