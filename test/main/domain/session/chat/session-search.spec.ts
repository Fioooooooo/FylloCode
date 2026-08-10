import { describe, expect, it } from "vitest";
import type { Message } from "@shared/types/chat";
import {
  findFirstMessageSearchSnippet,
  matchesSessionSearchQuery,
  normalizeSessionSearchQuery,
  SESSION_SEARCH_SNIPPET_LENGTH,
  stripSystemReminderSections,
} from "@main/domain/session/chat/session-search";

function message(role: Message["role"], parts: Message["parts"]): Message {
  return {
    id: `${role}-message`,
    role,
    parts,
    metadata: { sessionId: "session-1", createdAt: new Date("2026-08-10T00:00:00Z") },
  };
}

describe("session search domain", () => {
  it("matches user and assistant text with normalized whitespace and casing", () => {
    const messages = [
      message("user", [{ type: "text", text: "Plan   SESSION\nShare Page" }]),
      message("assistant", [{ type: "text", text: "A later answer" }]),
    ];

    expect(findFirstMessageSearchSnippet(messages, "session share")).toBe(
      "Plan SESSION Share Page"
    );
    expect(matchesSessionSearchQuery("FylloCode ÄPFEL", normalizeSessionSearchQuery("äpfel"))).toBe(
      true
    );
  });

  it("searches assistant text while ignoring reasoning and tool parts", () => {
    const messages = [
      message("assistant", [
        { type: "reasoning", text: "reasoning-secret" },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "Search",
          state: "output-available",
          input: { query: "tool-secret" },
          output: "tool-output-secret",
        },
        { type: "text", text: "Visible assistant answer" },
      ]),
    ];

    expect(findFirstMessageSearchSnippet(messages, "reasoning-secret")).toBeNull();
    expect(findFirstMessageSearchSnippet(messages, "tool-output-secret")).toBeNull();
    expect(findFirstMessageSearchSnippet(messages, "assistant answer")).toBe(
      "Visible assistant answer"
    );
  });

  it("removes every system reminder section without dropping adjacent visible text", () => {
    const text = [
      "<system-reminder>internal-secret</system-reminder>",
      "Visible request",
      "<system-reminder>another-secret</system-reminder>",
      "still visible",
    ].join("\n");
    const messages = [message("user", [{ type: "text", text }])];

    expect(stripSystemReminderSections(text)).not.toContain("internal-secret");
    expect(findFirstMessageSearchSnippet(messages, "internal-secret")).toBeNull();
    expect(findFirstMessageSearchSnippet(messages, "visible request")).toBe(
      "Visible request still visible"
    );
  });

  it("ignores non-user and non-assistant messages", () => {
    const messages = [message("system", [{ type: "text", text: "system-only-secret" }])];

    expect(findFirstMessageSearchSnippet(messages, "system-only-secret")).toBeNull();
  });

  it("builds a bounded snippet with ellipses on both truncated sides", () => {
    const messages = [
      message("assistant", [
        { type: "text", text: `${"a".repeat(140)}target phrase${"b".repeat(140)}` },
      ]),
    ];

    const snippet = findFirstMessageSearchSnippet(messages, "target phrase");
    expect(snippet).not.toBeNull();
    expect(snippet).toContain("target phrase");
    expect(snippet).toHaveLength(SESSION_SEARCH_SNIPPET_LENGTH);
    expect(snippet?.startsWith("…")).toBe(true);
    expect(snippet?.endsWith("…")).toBe(true);
  });
});
