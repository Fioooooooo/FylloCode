import { describe, expect, it } from "vitest";
import { collectChatPromptTimelineItems } from "@renderer/utils/chat-prompt-timeline";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

function message(
  id: string,
  role: UIMessage<MessageMeta>["role"],
  parts: UIMessage<MessageMeta>["parts"]
): UIMessage<MessageMeta> {
  return {
    id,
    role,
    parts,
    metadata: { sessionId: "session-1", createdAt: new Date("2026-06-30T00:00:00.000Z") },
  };
}

describe("collectChatPromptTimelineItems", () => {
  it("collects visible user text prompts in order", () => {
    const items = collectChatPromptTimelineItems([
      message("assistant-1", "assistant", [{ type: "text", text: "ignored" }]),
      message("user-1", "user", [{ type: "text", text: "First prompt" }]),
      message("user-2", "user", [
        { type: "text", text: "Second prompt" },
        { type: "text", text: "follow up" },
      ]),
    ]);

    expect(items).toEqual([
      {
        id: "user-1",
        messageId: "user-1",
        index: 1,
        label: "1",
        preview: "First prompt",
      },
      {
        id: "user-2",
        messageId: "user-2",
        index: 2,
        label: "2",
        preview: "Second prompt\n\nfollow up",
      },
    ]);
  });

  it("excludes system reminder text from previews", () => {
    const items = collectChatPromptTimelineItems([
      message("user-1", "user", [
        { type: "text", text: "<system-reminder>\nhidden\n</system-reminder>" },
        { type: "text", text: "visible prompt" },
      ]),
      message("user-2", "user", [
        { type: "text", text: "<system-reminder>\nhidden only\n</system-reminder>" },
      ]),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.preview).toBe("visible prompt");
  });

  it("uses attachment summaries when a user message has no visible text", () => {
    const items = collectChatPromptTimelineItems([
      message("user-1", "user", [
        {
          type: "file",
          mediaType: "image/png",
          url: "file:///tmp/image.png",
          filename: "image.png",
        },
        {
          type: "file",
          mediaType: "application/pdf",
          url: "file:///tmp/spec.pdf",
          filename: "spec.pdf",
        },
      ]),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.preview).toBe("图片附件、spec.pdf");
  });
});
