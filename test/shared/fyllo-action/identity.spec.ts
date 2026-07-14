import { describe, expect, it } from "vitest";
import { buildChatFylloActionId, parseChatFylloActionId } from "@shared/fyllo-action/identity";

describe("fyllo-action identity", () => {
  it("builds deterministic action id", () => {
    expect(
      buildChatFylloActionId({
        sessionId: "session-1",
        messageIndex: 2,
        partIndex: 3,
        actionOrdinalInPart: 4,
      })
    ).toBe("chat:session-1:2:3:4");
  });

  it("parses valid action id", () => {
    expect(parseChatFylloActionId("chat:session-1:2:3:4")).toEqual({
      sessionId: "session-1",
      messageIndex: 2,
      partIndex: 3,
      actionOrdinalInPart: 4,
    });
  });

  it("returns undefined for invalid action id", () => {
    expect(parseChatFylloActionId("not-chat:1:2:3")).toBeUndefined();
    expect(parseChatFylloActionId("chat:session:invalid:3:4")).toBeUndefined();
  });
});
