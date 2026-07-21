import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart } from "ai";
import { MessageAssembler } from "@main/domain/session/chat/message-assembler";
import type { SessionEvent } from "@main/domain/session/chat/session-events";

describe("MessageAssembler", () => {
  it("accumulates text_delta events into a single text part", () => {
    const a = new MessageAssembler("session-1");
    a.apply({ kind: "text_delta", text: "Hel" });
    a.apply({ kind: "text_delta", text: "lo" });
    a.apply({ kind: "text_delta", text: " world" });

    const msg = a.flush();
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("assistant");
    expect(msg!.parts).toHaveLength(1);
    expect(msg!.parts[0]).toEqual({ type: "text", text: "Hello world" });
    expect(msg!.metadata?.sessionId).toBe("session-1");
  });

  it("opens a fresh text part after a tool call", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "text_delta", text: "before" });
    a.apply({
      kind: "tool_call_start",
      toolCallId: "t1",
      title: "Read",
      toolKind: "read",
    });
    a.apply({ kind: "text_delta", text: "after" });

    const msg = a.flush();
    expect(msg!.parts.map((p) => p.type)).toEqual(["text", "dynamic-tool", "text"]);
    expect((msg!.parts[0] as { text: string }).text).toBe("before");
    expect((msg!.parts[2] as { text: string }).text).toBe("after");
  });

  it("writes toolKind metadata when tool_call_start creates a dynamic tool part", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "tool_call_start", toolCallId: "t1", title: "Read", toolKind: "read" });

    const msg = a.flush()!;
    const part = msg.parts[0] as DynamicToolUIPart;
    expect(part.type).toBe("dynamic-tool");
    expect(part.toolCallId).toBe("t1");
    expect(part.toolName).toBe("Read");
    expect(part.state).toBe("input-available");
    expect(part.toolMetadata).toEqual({ toolKind: "read" });
  });

  it("carries parentToolCallId into toolMetadata and preserves it across updates", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_start",
      toolCallId: "child",
      title: "Read",
      toolKind: "read",
      parentToolCallId: "parent",
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "child",
      status: "completed",
      content: "done",
    });

    const msg = a.flush()!;
    const part = msg.parts[0] as DynamicToolUIPart;
    expect(part.toolMetadata).toEqual({ toolKind: "read", parentToolCallId: "parent" });
  });

  it("keeps a stable toolName separate from the human-readable title", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_start",
      toolCallId: "t1",
      toolName: "Bash",
      title: "Run pnpm typecheck",
      toolKind: "execute",
      input: { command: "pnpm typecheck" },
    });

    const part = a.flush()!.parts[0] as DynamicToolUIPart;
    expect(part.toolName).toBe("Bash");
    expect(part.title).toBe("Run pnpm typecheck");
    expect(part.input).toEqual({ command: "pnpm typecheck" });
  });

  it("accumulates reasoning_delta events into a single reasoning part", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "reasoning_delta", text: "abc" });
    a.apply({ kind: "reasoning_delta", text: "de" });
    a.apply({ kind: "reasoning_delta", text: "fg" });

    const msg = a.flush()!;
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]).toEqual({ type: "reasoning", text: "abcdefg" });
  });

  it("keeps reasoning and text in separate parts when switching tracks", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "reasoning_delta", text: "r1" });
    a.apply({ kind: "text_delta", text: "t1" });
    a.apply({ kind: "reasoning_delta", text: "r2" });

    const msg = a.flush()!;
    expect(msg.parts).toEqual([
      { type: "reasoning", text: "r1" },
      { type: "text", text: "t1" },
      { type: "reasoning", text: "r2" },
    ]);
  });

  it("starts a fresh reasoning part after a tool call", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "reasoning_delta", text: "before" });
    a.apply({
      kind: "tool_call_start",
      toolCallId: "t1",
      title: "Read",
      toolKind: "read",
    });
    a.apply({ kind: "reasoning_delta", text: "after" });

    const msg = a.flush()!;
    expect(msg.parts.map((part) => part.type)).toEqual(["reasoning", "dynamic-tool", "reasoning"]);
    expect(msg.parts[0]).toEqual({ type: "reasoning", text: "before" });
    expect(msg.parts[2]).toEqual({ type: "reasoning", text: "after" });
  });

  it("creates an assistant message when reasoning is the first part", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "reasoning_delta", text: "first" });

    const msg = a.flush()!;
    expect(msg.role).toBe("assistant");
    expect(msg.parts[0]).toEqual({ type: "reasoning", text: "first" });
  });

  it("tool_call_update with completed status marks the part output-available", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "tool_call_start", toolCallId: "t1", title: "Read", toolKind: "read" });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "completed",
      content: "file contents",
    } as SessionEvent);

    const msg = a.flush()!;
    const part = msg.parts[0] as DynamicToolUIPart;
    expect(part.type).toBe("dynamic-tool");
    expect(part.state).toBe("output-available");
    expect((part as { output: unknown }).output).toBe("file contents");
    expect(part.toolMetadata).toEqual({ toolKind: "read" });
  });

  it("accumulates tool output deltas without replacing the title", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_start",
      toolCallId: "t1",
      toolName: "Bash",
      title: "Run tests",
      toolKind: "execute",
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      outputDelta: "first\n",
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      outputDelta: "second\n",
    });
    a.apply({ kind: "tool_call_update", toolCallId: "t1", status: "completed" });

    const part = a.flush()!.parts[0] as DynamicToolUIPart;
    expect(part.toolName).toBe("Bash");
    expect(part.title).toBe("Run tests");
    expect(part.state).toBe("output-available");
    expect(part.output).toBe("first\nsecond\n");
  });

  it("prefers the final tool content over accumulated output deltas", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_start",
      toolCallId: "t1",
      toolName: "Bash",
      title: "Run tests",
      toolKind: "execute",
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      outputDelta: "partial",
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "completed",
      content: "complete output",
    });

    expect((a.flush()!.parts[0] as DynamicToolUIPart).output).toBe("complete output");
  });

  it("tool_call_update with failed status still transitions to output-available", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "tool_call_start", toolCallId: "t1", title: "Read", toolKind: "read" });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "failed",
      content: "permission denied",
    } as SessionEvent);

    const msg = a.flush()!;
    expect((msg.parts[0] as DynamicToolUIPart).state).toBe("output-available");
    expect((msg.parts[0] as { output: unknown }).output).toBe("permission denied");
  });

  it("lazily creates a card for tool_call_update before a matching tool_call_start", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_update",
      toolCallId: "orphan",
      status: "completed",
      content: "result",
    } as SessionEvent);
    const msg = a.flush();
    expect(msg).not.toBeNull();
    const part = msg!.parts[0] as DynamicToolUIPart;
    expect(part.toolCallId).toBe("orphan");
    expect(part.state).toBe("output-available");
    expect((part as { output: unknown }).output).toBe("result");
  });

  it("flush clears internal state so the next cycle starts fresh", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "text_delta", text: "first" });
    const first = a.flush();
    expect(first).not.toBeNull();
    expect(a.flush()).toBeNull();

    a.apply({ kind: "text_delta", text: "second" });
    const second = a.flush();
    expect(second).not.toBeNull();
    expect((second!.parts[0] as { text: string }).text).toBe("second");
    expect(first!.id).not.toBe(second!.id);
  });

  it("flush resets reasoning state for the next cycle", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "reasoning_delta", text: "first" });
    expect(a.flush()!.parts).toEqual([{ type: "reasoning", text: "first" }]);

    a.apply({ kind: "reasoning_delta", text: "second" });
    expect(a.flush()!.parts).toEqual([{ type: "reasoning", text: "second" }]);
  });

  it("孤儿 tool_call_update（无 start）惰性建卡并填充", () => {
    const a = new MessageAssembler("s");
    // gemini list_directory：直接 completed，无 tool_call start
    a.apply({
      kind: "tool_call_update",
      toolCallId: "list_directory__1",
      status: "completed",
      title: "tool-call-trace",
      toolKind: "search",
      content: "Found 2 files",
    });

    const msg = a.flush();
    expect(msg).not.toBeNull();
    expect(msg!.parts).toHaveLength(1);
    const part = msg!.parts[0] as DynamicToolUIPart;
    expect(part.type).toBe("dynamic-tool");
    expect(part.toolCallId).toBe("list_directory__1");
    expect(part.toolName).toBe("tool-call-trace");
    expect(part.state).toBe("output-available");
    expect((part as { output?: unknown }).output).toBe("Found 2 files");
    expect(part.toolMetadata).toEqual({ toolKind: "search" });
  });

  it("孤儿 update 无 currentMessage 时也先创建 assistant 消息", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_update",
      toolCallId: "replace__1",
      status: "completed",
      content: "done",
    });
    const msg = a.flush();
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("assistant");
    const part = msg!.parts[0] as DynamicToolUIPart;
    expect(part.toolCallId).toBe("replace__1");
    expect(part.toolMetadata).toBeUndefined();
  });

  it("claude toolResponse-only 中间 update（仅带 toolName，无 title/content/input）不清空既有友好 title", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "tool_call_start", toolCallId: "t1", title: "Edit", toolKind: "edit" });
    // 第一次 in_progress：mapper 已把 title 归一为具体路径。
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      toolName: "Edit",
      title: "Edit data/tmp.txt",
      input: { file_path: "data/tmp.txt" },
    });
    // claude toolResponse-only 中间 update：仅带 toolName，无 title/content/input/outputDelta。
    a.apply({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      toolName: "Edit",
    });
    // completed 事件同样不带 title（claude Edit 的实际形态）。
    a.apply({ kind: "tool_call_update", toolCallId: "t1", status: "completed" });

    const msg = a.flush()!;
    const part = msg.parts[0] as DynamicToolUIPart;
    expect(part.title).toBe("Edit data/tmp.txt");
    expect(part.state).toBe("output-available");
  });

  it("merges stats-only subagent updates and preserves them through completion", () => {
    const a = new MessageAssembler("session-subagent");
    a.apply({
      kind: "tool_call_start",
      toolCallId: "parent",
      toolName: "Task",
      title: "Inspect ACP mapping",
      toolKind: "think",
      input: { prompt: "Find the mapping files" },
      subagent: {},
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "in_progress",
      subagent: {
        status: "in_progress",
        totalTokens: 1200,
        toolStats: { readCount: 2 },
      },
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "in_progress",
      subagent: {
        totalDurationMs: 2500,
        toolStats: { bashCount: 1 },
      },
    });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "completed",
      content: "Found the mapper",
      subagent: { status: "completed", totalToolUseCount: 3 },
    });

    const message = a.flush()!;
    const part = message.parts[0] as DynamicToolUIPart;
    expect(part.title).toBe("Inspect ACP mapping");
    expect(part.input).toEqual({ prompt: "Find the mapping files" });
    expect(part.output).toBe("Found the mapper");
    expect(part.toolMetadata?.subagent).toEqual({
      status: "completed",
      totalTokens: 1200,
      totalDurationMs: 2500,
      totalToolUseCount: 3,
      toolStats: { readCount: 2, bashCount: 1 },
    });
    expect(message.metadata).toMatchObject({ sessionId: "session-subagent" });
    expect(message.metadata).not.toHaveProperty("tokenUsage");
  });

  it("applies a delayed parent relationship even when the update has no display fields", () => {
    const a = new MessageAssembler("s");
    a.apply({ kind: "tool_call_start", toolCallId: "child", title: "Read", toolKind: "read" });
    a.apply({
      kind: "tool_call_update",
      toolCallId: "child",
      status: "in_progress",
      parentToolCallId: "parent",
    });

    const part = a.flush()!.parts[0] as DynamicToolUIPart;
    expect(part.toolMetadata).toEqual({ toolKind: "read", parentToolCallId: "parent" });
  });

  it("persists an empty subagent marker and failed terminal status", () => {
    const a = new MessageAssembler("s");
    a.apply({
      kind: "tool_call_start",
      toolCallId: "parent",
      title: "Task",
      toolKind: "think",
      subagent: {},
    });
    expect((a.flush()!.parts[0] as DynamicToolUIPart).toolMetadata?.subagent).toEqual({});

    a.apply({
      kind: "tool_call_update",
      toolCallId: "failed-parent",
      status: "failed",
      content: "Agent failed",
      subagent: { status: "failed" },
    });
    const failed = a.flush()!.parts[0] as DynamicToolUIPart;
    expect(failed.state).toBe("output-available");
    expect(failed.toolMetadata?.subagent).toEqual({ status: "failed" });
  });
});
