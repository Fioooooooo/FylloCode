import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { mapSessionUpdate } from "@main/services/session/chat/acp-mapper";
import { normalizeCodexThought } from "@main/services/session/chat/acp-mapper/agent-adapters/codex";

describe("Codex ACP event adapter", () => {
  it("normalizes thought summaries and drops whitespace", () => {
    expect(normalizeCodexThought("  ")).toBeNull();
    expect(normalizeCodexThought("**Inspecting architecture**")).toBe("Inspecting architecture\n");
    expect(normalizeCodexThought("detailed thought")).toBe("detailed thought");

    const whitespace = {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "  " },
    } as SessionUpdate;
    expect(mapSessionUpdate(whitespace, { agentId: "codex" })).toBeNull();
    expect(mapSessionUpdate(whitespace, { agentId: "gemini" })).toEqual({
      kind: "reasoning_delta",
      text: "  ",
    });
  });

  it.each([
    ["read", "Read"],
    ["write", "Write"],
    ["edit", "Edit"],
    ["search", "Search"],
    ["execute", "Bash"],
    ["other", "Tool"],
  ])("maps native %s tools to %s", (kind, expected) => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: `call_${kind}`,
      title: "Original title",
      kind,
      content: [],
    } as unknown as SessionUpdate;
    expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
      toolName: expected,
      title: "Original title",
    });
  });

  it.each([
    ["add", "Create tmp.txt"],
    ["update", "Edit tmp.txt"],
    ["delete", "Delete tmp.txt"],
  ])("builds a friendly %s edit title from structured diff metadata", (operation, title) => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: `call_${operation}`,
      title: "Editing files",
      kind: "edit",
      content: [
        {
          type: "diff",
          path: "/project/tmp.txt",
          oldText: operation === "add" ? null : "before",
          newText: operation === "delete" ? "" : "after",
          _meta: { kind: operation },
        },
      ],
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update, { agentId: "codex-acp" })).toMatchObject({
      toolName: "Edit",
      title,
    });
  });

  it("summarizes multi-file edits and falls back when metadata is incomplete", () => {
    const diff = (path: string, kind?: "add" | "update") => ({
      type: "diff",
      path,
      oldText: kind === "add" ? null : "old",
      newText: "new",
      _meta: kind ? { kind } : undefined,
    });
    const base = {
      sessionUpdate: "tool_call",
      toolCallId: "call_multi",
      title: "Editing files",
      kind: "edit",
    };

    expect(
      mapSessionUpdate(
        { ...base, content: [diff("/a.ts", "add"), diff("/b.ts", "add")] } as SessionUpdate,
        { agentId: "codex" }
      )
    ).toMatchObject({ title: "Create 2 files" });
    expect(
      mapSessionUpdate(
        { ...base, content: [diff("/a.ts", "add"), diff("/b.ts", "update")] } as SessionUpdate,
        { agentId: "codex" }
      )
    ).toMatchObject({ title: "Change 2 files" });
    expect(
      mapSessionUpdate({ ...base, content: [diff("/a.ts")] } as SessionUpdate, {
        agentId: "codex",
      })
    ).toMatchObject({ title: "Editing files" });
  });

  it("normalizes structured MCP identity and title for start and orphan update", () => {
    const rawInput = {
      server: "fyllo-specs",
      tool: "explore",
      arguments: { targetPath: "/project" },
    };
    const start = {
      sessionUpdate: "tool_call",
      toolCallId: "call_mcp",
      title: "legacy title",
      kind: "execute",
      rawInput,
    } as unknown as SessionUpdate;
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_mcp_orphan",
      title: "legacy title",
      kind: "execute",
      rawInput,
    } as unknown as SessionUpdate;

    for (const event of [
      mapSessionUpdate(start, { agentId: "codex" }),
      mapSessionUpdate(update, { agentId: "codex-acp" }),
    ]) {
      expect(event).toMatchObject({
        toolName: "fyllo-specs/explore",
        title: "Call fyllo-specs/explore",
      });
    }
  });

  it("maps terminal deltas and infers terminal completion", () => {
    const delta = {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_terminal",
      _meta: { terminal_output_delta: { data: "line 1\n" } },
    } as unknown as SessionUpdate;
    expect(mapSessionUpdate(delta, { agentId: "codex" })).toMatchObject({
      status: "in_progress",
      outputDelta: "line 1\n",
    });

    const completed = {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_terminal",
      rawOutput: { formatted_output: "line 1\nline 2\n" },
      _meta: { terminal_exit: { exit_code: 0 } },
    } as unknown as SessionUpdate;
    expect(mapSessionUpdate(completed, { agentId: "codex" })).toMatchObject({
      status: "completed",
      content: "line 1\nline 2\n",
    });

    const failed = {
      ...completed,
      rawOutput: { stderr: "command failed" },
      _meta: { terminal_exit: { exit_code: 2 } },
    } as unknown as SessionUpdate;
    expect(mapSessionUpdate(failed, { agentId: "codex" })).toMatchObject({
      status: "failed",
      content: "command failed",
    });
  });
});
