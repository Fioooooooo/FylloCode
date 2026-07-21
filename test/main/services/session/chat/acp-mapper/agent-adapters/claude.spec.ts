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
