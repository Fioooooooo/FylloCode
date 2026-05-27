import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "@renderer/stores/session";
import type { Session } from "@shared/types/chat";

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  loadMessages: vi.fn(),
}));

vi.mock("@renderer/api/chat", () => ({
  chatApi: {
    listSessions: mocks.listSessions,
    loadMessages: mocks.loadMessages,
    createSession: vi.fn(),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    persistMessage: vi.fn(),
    streamMessage: vi.fn(),
  },
}));

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    updatedAt: new Date("2026-05-12T00:00:00.000Z"),
    messages: [],
    ...overrides,
  };
}

describe("useSessionStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("overwrites availableCommands for an existing session", () => {
    const store = useSessionStore();
    store.sessions = [session()];

    store.setSessionAvailableCommands("session-1", [
      { name: "review", description: "Review code", hint: "path" },
    ]);

    expect(store.sessions[0]?.availableCommands).toEqual([
      { name: "review", description: "Review code", hint: "path" },
    ]);
  });

  it("does nothing when the session does not exist", () => {
    const store = useSessionStore();

    store.setSessionAvailableCommands("missing", [{ name: "review", description: "Review code" }]);

    expect(store.sessions).toEqual([]);
  });

  it("keeps an explicit empty array when clearing availableCommands", () => {
    const store = useSessionStore();
    store.sessions = [
      session({
        availableCommands: [{ name: "review", description: "Review code" }],
      }),
    ];

    store.setSessionAvailableCommands("session-1", []);

    expect(store.sessions[0]?.availableCommands).toEqual([]);
  });

  it("keeps availableCommands loaded from IPC sessions", async () => {
    const store = useSessionStore();
    mocks.listSessions.mockResolvedValue({
      ok: true,
      data: [
        session({
          id: "with-commands",
          availableCommands: [{ name: "review", description: "Review code" }],
        }),
        session({
          id: "empty-commands",
          availableCommands: [],
          updatedAt: new Date("2026-05-12T00:00:01.000Z"),
        }),
        session({
          id: "legacy",
          updatedAt: new Date("2026-05-12T00:00:02.000Z"),
        }),
      ],
    });

    await store.loadSessions("project-1");

    expect(store.sessions.map((item) => [item.id, item.availableCommands])).toEqual([
      ["legacy", undefined],
      ["empty-commands", []],
      ["with-commands", [{ name: "review", description: "Review code" }]],
    ]);
  });

  it("exposes selected session availableCommands through activeSession", async () => {
    const store = useSessionStore();
    store.sessions = [
      session({
        id: "session-a",
        availableCommands: [{ name: "review", description: "Review code" }],
      }),
      session({
        id: "session-b",
        availableCommands: [],
      }),
    ];
    mocks.loadMessages.mockResolvedValue({ ok: true, data: [] });

    await store.selectSession("session-a");
    expect(store.activeSession?.availableCommands).toEqual([
      { name: "review", description: "Review code" },
    ]);

    await store.selectSession("session-b");
    expect(store.activeSession?.availableCommands).toEqual([]);
  });

  it("setSessionConfigOptions overwrites configOptions for the session", () => {
    const store = useSessionStore();
    store.sessions = [session()];

    store.setSessionConfigOptions("session-1", [
      {
        type: "select",
        id: "model",
        name: "Model",
        currentValue: "haiku",
        options: [{ value: "haiku", name: "Haiku" }],
      },
    ]);

    expect(store.sessions[0]?.configOptions).toEqual([
      expect.objectContaining({ id: "model", currentValue: "haiku" }),
    ]);
  });

  it("setSessionConfigOptions does nothing when session is missing", () => {
    const store = useSessionStore();
    store.setSessionConfigOptions("missing", []);
    expect(store.sessions).toEqual([]);
  });
});
