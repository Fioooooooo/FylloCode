import { describe, expect, it } from "vitest";
import {
  buildChatFylloActionId,
  collectFylloActionSources,
  parseFylloActionNode,
} from "@shared/utils/fyllo-action";

describe("shared Fyllo action tag utilities", () => {
  it("builds stable chat action ids", () => {
    expect(
      buildChatFylloActionId({
        sessionId: "session-1",
        messageIndex: 2,
        partIndex: 1,
        actionOrdinalInPart: 3,
      })
    ).toBe("chat:session-1:2:1:3");
  });

  it("collects and parses ready action tags from assistant text", () => {
    const [source] = collectFylloActionSources(
      [
        "Before",
        '<fyllo-action type="knowledge.flag">',
        '{"summary":"Remember this.","contextPaths":["src/main/index.ts"]}',
        "</fyllo-action>",
        "After",
      ].join("\n")
    );

    expect(source).toMatchObject({
      attrs: { type: "knowledge.flag" },
      loading: false,
    });

    expect(parseFylloActionNode(source)).toEqual({
      status: "ready",
      type: "knowledge.flag",
      payload: {
        summary: "Remember this.",
        contextPaths: ["src/main/index.ts"],
      },
    });
  });
});
