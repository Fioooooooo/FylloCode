import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
  mapToolCallStart,
  mapToolCallUpdate,
} from "@main/services/session/chat/acp-mapper/tool-call-mapper";

describe("ACP tool-call baseline mapping", () => {
  it("extracts start input, diff and locations without Agent knowledge", () => {
    const rawInput = { file_path: "/a.txt", nested: { value: 1 } };
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "call_1",
      title: "Edit file",
      kind: "edit",
      rawInput,
      content: [{ type: "diff", path: "/a.txt", oldText: null, newText: "new" }],
      locations: [{ path: "/a.txt", line: 4 }],
    } as unknown as Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;

    const event = mapToolCallStart(update);
    rawInput.nested.value = 2;

    expect(event).toEqual({
      kind: "tool_call_start",
      toolCallId: "call_1",
      toolName: "Edit file",
      title: "Edit file",
      toolKind: "edit",
      input: { file_path: "/a.txt", nested: { value: 1 } },
      diff: [{ path: "/a.txt", oldText: undefined, newText: "new" }],
      locations: [{ path: "/a.txt", line: 4 }],
    });
  });

  it("uses structured MCP identity when ACP rawInput provides it", () => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "call_mcp",
      title: "legacy title",
      rawInput: { server: "fyllo-specs", tool: "explore", arguments: {} },
    } as unknown as Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;

    expect(mapToolCallStart(update)).toMatchObject({
      toolName: "fyllo-specs/explore",
      title: "fyllo-specs/explore",
    });
  });

  it("does not let Agent-specific metadata override the ACP title", () => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "call_other",
      title: "Canonical ACP title",
      rawInput: {},
      _meta: { claudeCode: { toolName: "Legacy Claude tool name" } },
    } as unknown as Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;

    expect(mapToolCallStart(update)).toMatchObject({
      toolName: "Canonical ACP title",
      title: "Canonical ACP title",
    });
  });

  it("joins text content and extracts update diff and locations", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "replace__1",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "first" } },
        { type: "content", content: { type: "text", text: " second" } },
        { type: "diff", path: "/test.txt", newText: "new", oldText: "old" },
      ],
      locations: [{ path: "/test.txt" }],
    } as unknown as Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>;

    expect(mapToolCallUpdate(update)).toEqual({
      kind: "tool_call_update",
      toolCallId: "replace__1",
      status: "completed",
      input: undefined,
      content: "first second",
      diff: [{ path: "/test.txt", newText: "new", oldText: "old" }],
      locations: [{ path: "/test.txt", line: undefined }],
      title: undefined,
      toolKind: undefined,
    });
  });

  it("preserves orphan update fields for assembler lazy card creation", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "list_directory__1",
      title: "tool-call-trace",
      kind: "search",
      status: "completed",
    } as unknown as Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>;

    expect(mapToolCallUpdate(update)).toMatchObject({
      status: "completed",
      title: "tool-call-trace",
      toolKind: "search",
    });
  });

  it("repairs completed plus rawOutput.error and rejects unsupported status", () => {
    const failed = {
      sessionUpdate: "tool_call_update",
      toolCallId: "grep_1",
      status: "completed",
      rawOutput: { error: "spawn rg ENOENT" },
    } as unknown as Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>;
    expect(mapToolCallUpdate(failed)).toMatchObject({
      status: "failed",
      content: "spawn rg ENOENT",
    });

    expect(
      mapToolCallUpdate({ ...failed, status: "pending" } as unknown as Extract<
        SessionUpdate,
        { sessionUpdate: "tool_call_update" }
      >)
    ).toBeNull();
  });
});
