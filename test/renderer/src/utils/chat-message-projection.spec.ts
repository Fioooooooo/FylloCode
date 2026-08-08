import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import {
  projectChatMessages,
  projectVisibleUserMessageParts,
} from "@renderer/utils/chat-message-projection";

function message(
  id: string,
  role: UIMessage<MessageMeta>["role"],
  parts: UIMessage<MessageMeta>["parts"]
): UIMessage<MessageMeta> {
  return {
    id,
    role,
    parts,
    metadata: { sessionId: "session-1", createdAt: new Date("2026-08-08T00:00:00.000Z") },
  };
}

describe("chat-message-projection", () => {
  it("removes reminder-only user messages and preserves source indexes", () => {
    const assistant = message("assistant-1", "assistant", [{ type: "text", text: "done" }]);
    const projections = projectChatMessages(
      [
        message("user-1", "user", [{ type: "text", text: "visible prompt" }]),
        message("notification", "user", [
          { type: "text", text: "<system-reminder>hidden</system-reminder>" },
        ]),
        assistant,
      ],
      { host: "chat" }
    );

    expect(projections.map(({ message: item }) => item.id)).toEqual(["user-1", "assistant-1"]);
    expect(projections.map(({ sourceIndex }) => sourceIndex)).toEqual([0, 2]);
    expect(projections[1]?.message).toBe(assistant);
  });

  it("removes reminder parts while retaining visible user content without mutating source", () => {
    const source = message("user-1", "user", [
      { type: "text", text: "<system-reminder>hidden</system-reminder>" },
      { type: "text", text: "visible prompt" },
      {
        type: "file",
        mediaType: "application/pdf",
        url: "file:///tmp/spec.pdf",
        filename: "spec.pdf",
      },
    ]);

    const [projection] = projectChatMessages([source], { host: "side" });

    expect(projection?.message.parts).toEqual(source.parts.slice(1));
    expect(projection?.message).not.toBe(source);
    expect(source.parts).toHaveLength(3);
  });

  it("keeps assistant reminder-like text unchanged", () => {
    const source = message("assistant-1", "assistant", [
      { type: "text", text: "<system-reminder>assistant output</system-reminder>" },
    ]);

    expect(projectChatMessages([source], { host: "chat" })).toEqual([
      { message: source, sourceIndex: 0 },
    ]);
  });

  it("shares user part visibility without dropping attachments", () => {
    const parts: UIMessage["parts"] = [
      { type: "text", text: "<system-reminder>hidden</system-reminder>" },
      {
        type: "file",
        mediaType: "image/png",
        url: "file:///tmp/image.png",
        filename: "image.png",
      },
    ];

    expect(projectVisibleUserMessageParts(parts)).toEqual([parts[1]]);
  });
});
