import { ref } from "vue";
import { describe, expect, it } from "vitest";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { useUIMessageAssembler } from "@renderer/composables/useUIMessageAssembler";
import type { MessageMeta } from "@shared/types/chat";

function userMessage(): UIMessage<MessageMeta> {
  return {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "prompt" }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

describe("useUIMessageAssembler", () => {
  it("accumulates text deltas into one assistant message", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    assembler.applyChunk({ kind: "text_delta", text: "hello " });
    assembler.applyChunk({ kind: "text_delta", text: "world" });

    expect(messages.value).toHaveLength(1);
    expect(messages.value[0]?.role).toBe("assistant");
    expect(messages.value[0]?.parts).toEqual([{ type: "text", text: "hello world" }]);
    expect(messages.value[0]?.metadata?.sessionId).toBe("session-1");
  });

  it("updates tool calls to output-available", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      title: "Read",
      toolKind: "read",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "completed",
      content: "done",
    });

    expect(messages.value[0]?.parts[0]).toMatchObject({
      type: "dynamic-tool",
      toolCallId: "tool-1",
      state: "output-available",
      output: "done",
      toolMetadata: { toolKind: "read" },
    });
  });

  it("writes toolKind metadata when tool_call_start creates a dynamic tool part", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      title: "Read",
      toolKind: "read",
    });

    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.type).toBe("dynamic-tool");
    expect(part.toolCallId).toBe("tool-1");
    expect(part.toolName).toBe("Read");
    expect(part.state).toBe("input-available");
    expect(part.toolMetadata).toEqual({ toolKind: "read" });
  });

  it("inserts user_message and starts a new assistant message after it", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({ kind: "text_delta", text: "before" });
    assembler.applyChunk({ kind: "user_message", message: userMessage() });
    assembler.applyChunk({ kind: "text_delta", text: "after" });

    expect(messages.value).toHaveLength(3);
    expect(messages.value[0]?.role).toBe("assistant");
    expect(messages.value[1]).toEqual(userMessage());
    expect(messages.value[2]?.role).toBe("assistant");
    expect(messages.value[2]?.parts).toEqual([{ type: "text", text: "after" }]);
  });

  it("accumulates reasoning deltas into one reasoning part", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    assembler.applyChunk({ kind: "reasoning_delta", text: "think " });
    assembler.applyChunk({ kind: "reasoning_delta", text: "more" });

    expect(messages.value).toHaveLength(1);
    expect(messages.value[0]?.parts).toEqual([
      { type: "reasoning", text: "think more", state: "streaming" },
    ]);
  });

  it("marks reasoning done when text starts", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({ kind: "reasoning_delta", text: "r1" });
    assembler.applyChunk({ kind: "text_delta", text: "t1" });
    assembler.applyChunk({ kind: "reasoning_delta", text: "r2" });

    expect(messages.value[0]?.parts).toEqual([
      { type: "reasoning", text: "r1", state: "done" },
      { type: "text", text: "t1" },
      { type: "reasoning", text: "r2", state: "streaming" },
    ]);
  });

  it("marks reasoning done when tool_call_start starts", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({ kind: "reasoning_delta", text: "r1" });
    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      title: "Read",
      toolKind: "read",
    });
    assembler.applyChunk({ kind: "reasoning_delta", text: "r2" });

    expect(messages.value[0]?.parts.map((part) => part.type)).toEqual([
      "reasoning",
      "dynamic-tool",
      "reasoning",
    ]);
    expect(messages.value[0]?.parts[0]).toMatchObject({
      type: "reasoning",
      text: "r1",
      state: "done",
    });
    expect(messages.value[0]?.parts[2]).toMatchObject({
      type: "reasoning",
      text: "r2",
      state: "streaming",
    });
  });

  it("marks active reasoning done when reset", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({ kind: "reasoning_delta", text: "r1" });
    assembler.resetActive();

    expect(messages.value[0]?.parts).toEqual([{ type: "reasoning", text: "r1", state: "done" }]);
  });

  it("ignores available_commands_update chunks", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "available_commands_update",
      commands: [{ name: "review", description: "Review code", hint: "path" }],
    });

    expect(messages.value).toHaveLength(0);
  });

  it("ignores plan_update chunks", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "plan_update",
      entries: [{ content: "分析代码", priority: "high", status: "pending" }],
    });

    expect(messages.value).toHaveLength(0);
  });

  it("孤儿 tool_call_update（无 start）惰性建卡", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    // gemini replace：直接 completed，无 tool_call start
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "replace__1",
      status: "completed",
      title: "test.txt",
      toolKind: "edit",
      content: "edited",
    });

    expect(messages.value).toHaveLength(1);
    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.type).toBe("dynamic-tool");
    expect(part.toolCallId).toBe("replace__1");
    expect(part.toolName).toBe("test.txt");
    expect(part.state).toBe("output-available");
    expect(part.output).toBe("edited");
    expect(part.toolMetadata).toEqual({ toolKind: "edit" });
  });

  it("缺少 toolKind 的孤儿 update 仍保持兼容", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "replace__1",
      status: "completed",
      content: "done",
    });

    expect(messages.value).toHaveLength(1);
    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.type).toBe("dynamic-tool");
    expect(part.toolCallId).toBe("replace__1");
    expect(part.state).toBe("output-available");
    expect(part.output).toBe("done");
    expect(part.toolMetadata).toBeUndefined();
  });
});
