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
  it("exposes the active renderer assistant message ID only for the current stream", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    expect(assembler.getActiveAssistantMessageId()).toBeNull();

    assembler.applyChunk({ kind: "reasoning_delta", text: "think" });
    const reasoningMessageId = assembler.getActiveAssistantMessageId();

    expect(reasoningMessageId).toBe(messages.value[0]?.id);

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      title: "Read",
      toolKind: "read",
    });
    expect(assembler.getActiveAssistantMessageId()).toBe(reasoningMessageId);

    assembler.resetActive();
    expect(assembler.getActiveAssistantMessageId()).toBeNull();
  });

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

  it("keeps a stable toolName separate from the human-readable title", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      toolName: "Bash",
      title: "Run pnpm typecheck",
      toolKind: "execute",
      input: { command: "pnpm typecheck" },
    });

    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.toolName).toBe("Bash");
    expect(part.title).toBe("Run pnpm typecheck");
    expect(part.input).toEqual({ command: "pnpm typecheck" });
  });

  it("shows accumulated live tool output without replacing the title", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      toolName: "Bash",
      title: "Run tests",
      toolKind: "execute",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "in_progress",
      outputDelta: "first\n",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "in_progress",
      outputDelta: "second\n",
    });

    const streaming = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(streaming.title).toBe("Run tests");
    expect(streaming.toolMetadata).toEqual({
      toolKind: "execute",
      liveOutput: "first\nsecond\n",
    });

    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "completed",
    });

    const completed = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(completed.title).toBe("Run tests");
    expect(completed.output).toBe("first\nsecond\n");
    expect(completed.toolMetadata).toEqual({ toolKind: "execute" });
  });

  it("prefers final tool content over accumulated live output", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "tool-1",
      toolName: "Bash",
      title: "Run tests",
      toolKind: "execute",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "in_progress",
      outputDelta: "partial",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "completed",
      content: "complete output",
    });

    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.output).toBe("complete output");
    expect(part.toolMetadata).toEqual({ toolKind: "execute" });
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

  it("ignores agenda_update chunks", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);

    assembler.applyChunk({
      kind: "agenda_update",
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

  it("claude toolResponse-only 中间 update（仅带 toolName，无 title/content/input）不清空既有友好 title", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "t1",
      title: "Edit",
      toolKind: "edit",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      toolName: "Edit",
      title: "Edit data/tmp.txt",
      input: { file_path: "data/tmp.txt" },
    });
    // claude toolResponse-only 中间 update：仅带 toolName，无 title/content/input/outputDelta。
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "in_progress",
      toolName: "Edit",
    });
    assembler.applyChunk({ kind: "tool_call_update", toolCallId: "t1", status: "completed" });

    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.title).toBe("Edit data/tmp.txt");
    expect(part.state).toBe("output-available");
  });

  it("merges stats-only subagent updates and preserves live output behavior", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages, { sessionId: "session-1" });

    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "parent",
      toolName: "Task",
      title: "Inspect ACP mapping",
      toolKind: "think",
      input: { prompt: "Find the mapping files" },
      subagent: {},
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "in_progress",
      outputDelta: "partial",
      subagent: {
        status: "in_progress",
        totalTokens: 1200,
        toolStats: { readCount: 2 },
      },
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "in_progress",
      subagent: { totalDurationMs: 2500, toolStats: { bashCount: 1 } },
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "completed",
      subagent: { status: "completed", totalToolUseCount: 3 },
    });

    const part = messages.value[0]?.parts[0] as DynamicToolUIPart;
    expect(part.title).toBe("Inspect ACP mapping");
    expect(part.input).toEqual({ prompt: "Find the mapping files" });
    expect(part.output).toBe("partial");
    expect(part.toolMetadata).toEqual({
      toolKind: "think",
      subagent: {
        status: "completed",
        totalTokens: 1200,
        totalDurationMs: 2500,
        totalToolUseCount: 3,
        toolStats: { readCount: 2, bashCount: 1 },
      },
    });
  });

  it("applies delayed parent metadata and failed subagent status", () => {
    const messages = ref<UIMessage<MessageMeta>[]>([]);
    const assembler = useUIMessageAssembler(messages);
    assembler.applyChunk({
      kind: "tool_call_start",
      toolCallId: "child",
      title: "Read",
      toolKind: "read",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "child",
      status: "in_progress",
      parentToolCallId: "parent",
    });
    assembler.applyChunk({
      kind: "tool_call_update",
      toolCallId: "parent",
      status: "failed",
      content: "Agent failed",
      subagent: { status: "failed" },
    });

    expect((messages.value[0]?.parts[0] as DynamicToolUIPart).toolMetadata).toEqual({
      toolKind: "read",
      parentToolCallId: "parent",
    });
    const parent = messages.value[0]?.parts[1] as DynamicToolUIPart;
    expect(parent.toolMetadata?.subagent).toEqual({ status: "failed" });
    expect(parent.output).toBe("Agent failed");
  });
});
