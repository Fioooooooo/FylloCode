import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeFlagActionHandler } from "@renderer/features/fyllo-action/application/handlers/knowledge-flag";
import type { FylloActionPayload } from "@shared/fyllo-action/protocol";
import type { ChatStatus } from "@shared/types/chat";

describe("knowledge-flag handler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function setup(
    options: {
      sendMessageAndAwaitDurableAppend?: () => Promise<{ messageId: string }>;
      pendingFlags?: Array<{ actionId: string; summary: string; contextPaths?: string[] }>;
      chatStatus?: ChatStatus;
    } = {}
  ) {
    const sendMessageAndAwaitDurableAppend = vi.fn(
      options.sendMessageAndAwaitDurableAppend ?? (() => Promise.resolve({ messageId: "msg-1" }))
    );
    const handler = createKnowledgeFlagActionHandler({
      getChatStatus: () => options.chatStatus ?? "ready",
      getPendingKnowledgeFlags: () => options.pendingFlags ?? [],
      sendMessageAndAwaitDurableAppend,
    });

    return { handler, sendMessageAndAwaitDurableAppend };
  }

  it("awaits durable append before returning succeeded", async () => {
    const { handler, sendMessageAndAwaitDurableAppend } = setup();

    const result = await handler({ summary: "candidate" } as FylloActionPayload<"knowledge.flag">, {
      context: { projectId: "project-1", sessionId: "session-1", actionId: "action-1" },
    });

    expect(sendMessageAndAwaitDurableAppend).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcome: "succeeded" });
  });

  it("returns batch completedActionIds for all pending flags", async () => {
    const { handler, sendMessageAndAwaitDurableAppend } = setup({
      pendingFlags: [
        { actionId: "action-1", summary: "first" },
        { actionId: "action-2", summary: "second" },
      ],
    });

    const result = await handler({ summary: "first" } as FylloActionPayload<"knowledge.flag">, {
      context: { projectId: "project-1", sessionId: "session-1", actionId: "action-1" },
    });

    expect(sendMessageAndAwaitDurableAppend).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcome: "succeeded",
      completedActionIds: ["action-1", "action-2"],
    });
  });

  it("returns failed when durable append fails", async () => {
    const { handler, sendMessageAndAwaitDurableAppend } = setup({
      sendMessageAndAwaitDurableAppend: () => Promise.reject(new Error("persist failed")),
    });

    const result = await handler({ summary: "candidate" } as FylloActionPayload<"knowledge.flag">, {
      context: { projectId: "project-1", sessionId: "session-1", actionId: "action-1" },
    });

    expect(sendMessageAndAwaitDurableAppend).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcome: "failed", error: "persist failed" });
  });

  it("refuses to send while assistant is responding", async () => {
    const { handler, sendMessageAndAwaitDurableAppend } = setup({ chatStatus: "streaming" });

    const result = await handler({ summary: "candidate" } as FylloActionPayload<"knowledge.flag">, {
      context: { projectId: "project-1", sessionId: "session-1", actionId: "action-1" },
    });

    expect(sendMessageAndAwaitDurableAppend).not.toHaveBeenCalled();
    expect(result.outcome).toBe("failed");
  });
});
