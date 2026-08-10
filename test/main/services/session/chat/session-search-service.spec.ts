import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@shared/types/chat";
import type { SessionMeta } from "@main/infra/storage/session-store";

const mocks = vi.hoisted(() => ({
  listSessionMetas: vi.fn(),
  loadMessages: vi.fn(),
}));

vi.mock("@main/infra/storage/session-store", () => ({
  listSessionMetas: mocks.listSessionMetas,
  loadMessages: mocks.loadMessages,
}));

import { searchSessions } from "@main/services/session/chat/session-search-service";

function meta(
  sessionId: string,
  title: string,
  updatedAt = "2026-08-10T00:00:00.000Z"
): SessionMeta {
  return {
    sessionId,
    agentId: "codex-acp",
    sessionMode: "fyllocode",
    title,
    turnCount: 1,
    tokenUsage: { used: 0, size: 0 },
    createdAt: updatedAt,
    updatedAt,
  };
}

function textMessage(text: string): Message {
  return {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-08-10T00:00:00Z") },
  };
}

describe("searchSessions", () => {
  beforeEach(() => {
    mocks.listSessionMetas.mockReset();
    mocks.loadMessages.mockReset();
    mocks.loadMessages.mockResolvedValue([]);
  });

  it("prioritizes title, then Session ID, then message matches", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta("session-message", "Unrelated", "2026-08-12T00:00:00Z"),
      meta("session-target-id", "Another title", "2026-08-11T00:00:00Z"),
      meta("session-title", "Target design", "2026-08-10T00:00:00Z"),
    ]);
    mocks.loadMessages.mockImplementation(async (_workspaceId: string, sessionId: string) =>
      sessionId === "session-message" ? [textMessage("Target appears in the body")] : []
    );

    const results = await searchSessions("workspace-1", "target");

    expect(results.map(({ sessionId, matchKind }) => ({ sessionId, matchKind }))).toEqual([
      { sessionId: "session-title", matchKind: "title" },
      { sessionId: "session-target-id", matchKind: "session-id" },
      { sessionId: "session-message", matchKind: "message" },
    ]);
    expect(results[2]?.snippet).toBe("Target appears in the body");
  });

  it("sorts matches in the same category by updatedAt descending", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta("session-old", "Search old", "2026-08-01T00:00:00Z"),
      meta("session-new", "Search new", "2026-08-09T00:00:00Z"),
    ]);

    const results = await searchSessions("workspace-1", "search");

    expect(results.map((result) => result.sessionId)).toEqual(["session-new", "session-old"]);
    expect(mocks.loadMessages).not.toHaveBeenCalled();
  });

  it("stops at 50 metadata results without reading messages", async () => {
    mocks.listSessionMetas.mockResolvedValue(
      Array.from({ length: 55 }, (_, index) =>
        meta(
          `session-${index}`,
          `matching title ${index}`,
          new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString()
        )
      )
    );

    const results = await searchSessions("workspace-1", "matching");

    expect(results).toHaveLength(50);
    expect(results[0]?.sessionId).toBe("session-54");
    expect(mocks.loadMessages).not.toHaveBeenCalled();
  });

  it("skips empty and unreadable message histories while continuing the search", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta("session-broken", "Broken", "2026-08-12T00:00:00Z"),
      meta("session-empty", "Empty", "2026-08-11T00:00:00Z"),
      meta("session-match", "Body", "2026-08-10T00:00:00Z"),
    ]);
    mocks.loadMessages.mockImplementation(async (_workspaceId: string, sessionId: string) => {
      if (sessionId === "session-broken") {
        throw new Error("unreadable");
      }
      return sessionId === "session-match" ? [textMessage("find the needle here")] : [];
    });

    const results = await searchSessions("workspace-1", "needle");

    expect(results).toEqual([
      expect.objectContaining({ sessionId: "session-match", matchKind: "message" }),
    ]);
    expect(mocks.loadMessages).toHaveBeenCalledTimes(3);
  });

  it("does not search messages for title or Session ID matches", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta("session-title", "Needle title"),
      meta("session-needle-id", "Other title"),
    ]);

    await searchSessions("workspace-1", "needle");

    expect(mocks.loadMessages).not.toHaveBeenCalled();
  });
});
