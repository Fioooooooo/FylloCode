import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart } from "ai";
import { MessageAssembler } from "@main/domain/chat/message-assembler";
import type { SessionEvent } from "@main/domain/chat/session-events";

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
    expect((msg!.parts[0] as DynamicToolUIPart).toolCallId).toBe("replace__1");
  });
});
