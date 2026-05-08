import { ref } from "vue";
import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
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
    });
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
});
