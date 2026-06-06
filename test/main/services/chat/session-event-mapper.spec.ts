import { describe, expect, it, vi } from "vitest";

// session-event-mapper 的 SessionEvent 类型定义依赖仅 types，这里为测试目的构造输入。
import { toMessageChunk } from "@main/services/chat/session-event-mapper";
import type { SessionEvent } from "@main/domain/chat/session-events";

describe("toMessageChunk", () => {
  it("maps text_delta", () => {
    const ev: SessionEvent = { type: "text_delta", text: "hello" };
    expect(toMessageChunk(ev)).toEqual({ kind: "text_delta", text: "hello" });
  });

  it("maps reasoning_delta", () => {
    const ev: SessionEvent = { type: "reasoning_delta", text: "thinking" };
    expect(toMessageChunk(ev)).toEqual({ kind: "reasoning_delta", text: "thinking" });
  });

  it("maps tool_call_start preserving kind", () => {
    const ev: SessionEvent = {
      type: "tool_call_start",
      toolCallId: "t1",
      title: "Read",
      kind: "read",
    };
    expect(toMessageChunk(ev)).toEqual({
      kind: "tool_call_start",
      toolCallId: "t1",
      title: "Read",
      toolKind: "read",
    });
  });

  it("maps tool_call_update and deep-clones input", () => {
    const input = { path: "/a", meta: { nested: true } };
    const ev: SessionEvent = {
      type: "tool_call_update",
      toolCallId: "t1",
      status: "completed",
      input,
      content: "done",
    };
    const chunk = toMessageChunk(ev);
    expect(chunk).toEqual({
      kind: "tool_call_update",
      toolCallId: "t1",
      status: "completed",
      input: { path: "/a", meta: { nested: true } },
      content: "done",
    });
    // cloned so later mutation doesn't leak
    input.meta.nested = false;
    expect((chunk as unknown as { input: { meta: { nested: boolean } } }).input.meta.nested).toBe(
      true
    );
  });

  it("maps session_info_update", () => {
    expect(
      toMessageChunk({ type: "session_info_update", title: "New title" } as SessionEvent)
    ).toEqual({ kind: "session_info_update", title: "New title" });
  });

  it("maps usage_update", () => {
    const ev: SessionEvent = {
      type: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    };

    expect(toMessageChunk(ev)).toEqual({
      kind: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    });
  });

  it("maps available_commands_update without cloning", () => {
    const commands = [{ name: "review", description: "Review code", hint: "commit sha" }];
    const ev: SessionEvent = {
      type: "available_commands_update",
      commands,
    };

    const chunk = toMessageChunk(ev);
    expect(chunk).toEqual({
      kind: "available_commands_update",
      commands,
    });
    expect(chunk && "commands" in chunk ? chunk.commands : null).toBe(commands);
  });

  it("maps config_options_update without cloning", () => {
    const options = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
    ];
    const ev: SessionEvent = { type: "config_options_update", options };
    const chunk = toMessageChunk(ev);
    expect(chunk).toEqual({ kind: "config_options_update", options });
    expect(chunk && "options" in chunk ? chunk.options : null).toBe(options);
  });

  it("maps plan_update without cloning", () => {
    const entries = [
      { content: "分析代码", priority: "high" as const, status: "completed" as const },
      { content: "写测试", priority: "medium" as const, status: "in_progress" as const },
    ];
    const ev: SessionEvent = { type: "plan_update", entries };
    const chunk = toMessageChunk(ev);
    expect(chunk).toEqual({ kind: "plan_update", entries });
    expect(chunk && "entries" in chunk ? chunk.entries : null).toBe(entries);
  });

  it("returns null for terminal / internal events", () => {
    expect(toMessageChunk({ type: "done", totalTokens: 42 } as SessionEvent)).toBeNull();
    expect(
      toMessageChunk({ type: "error", code: "ACP_ERROR", message: "x" } as SessionEvent)
    ).toBeNull();
    expect(
      toMessageChunk({ type: "session_id_resolved", acpSessionId: "s1" } as SessionEvent)
    ).toBeNull();
  });

  // Make sure we don't accidentally export any hidden state.
  it("is a pure function", () => {
    const spy = vi.fn();
    spy(toMessageChunk({ type: "text_delta", text: "a" }));
    spy(toMessageChunk({ type: "text_delta", text: "a" }));
    expect(spy.mock.calls[0][0]).toEqual(spy.mock.calls[1][0]);
  });
});
