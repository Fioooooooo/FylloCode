import { describe, expect, it } from "vitest";
import {
  collectChatPromptTimelineItems,
  type ChatPromptTimelineSource,
} from "@renderer/features/chat-prompt-timeline/model/chat-prompt-timeline";

function source(
  id: string,
  overrides: Partial<ChatPromptTimelineSource> = {}
): ChatPromptTimelineSource {
  return {
    id,
    messageId: id,
    role: "user",
    visibleTextParts: [],
    attachmentSummaries: [],
    ...overrides,
  };
}

describe("collectChatPromptTimelineItems", () => {
  it("keeps user sources in order and assigns compact ordinals", () => {
    const items = collectChatPromptTimelineItems([
      source("user-1", { visibleTextParts: ["First prompt"] }),
      source("assistant-1", { role: "other", visibleTextParts: ["Ignored"] }),
      source("user-2", { visibleTextParts: ["Second prompt", "follow up"] }),
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

  it("prefers visible text and falls back to attachment summaries", () => {
    const items = collectChatPromptTimelineItems([
      source("text", {
        visibleTextParts: ["  Visible prompt  "],
        attachmentSummaries: ["image.png"],
      }),
      source("attachment", { attachmentSummaries: [" 图片附件 ", "spec.pdf"] }),
      source("empty", { visibleTextParts: ["  "], attachmentSummaries: [""] }),
    ]);

    expect(items.map((item) => item.preview)).toEqual(["Visible prompt", "图片附件、spec.pdf"]);
    expect(items.map((item) => item.index)).toEqual([1, 2]);
  });
});
