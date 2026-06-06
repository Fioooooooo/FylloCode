import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  listSessionMetas: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  createSessionMeta: vi.fn(),
}));

vi.mock("@main/infra/storage/project-store", () => ({
  loadProject: mocks.loadProject,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  appendMessage: vi.fn(),
  createSessionMeta: mocks.createSessionMeta,
  deleteSession: vi.fn(),
  listSessionMetas: mocks.listSessionMetas,
  loadMessages: vi.fn(),
  loadSessionMeta: mocks.loadSessionMeta,
  patchSessionMeta: mocks.patchSessionMeta,
}));

import { listSessions, createSession } from "@main/services/chat/chat-service";

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    agentId: "claude-acp",
    title: "Session",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("chat-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProject.mockResolvedValue({ id: "project-1", path: "/tmp/project" });
  });

  it("maps persisted available_commands when listing sessions", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta({
        sessionId: "with-commands",
        available_commands: [{ name: "review", description: "Review code" }],
      }),
      meta({
        sessionId: "empty-commands",
        available_commands: [],
        updatedAt: "2026-05-14T00:00:01.000Z",
      }),
      meta({
        sessionId: "legacy",
        updatedAt: "2026-05-14T00:00:02.000Z",
      }),
    ]);

    const sessions = await listSessions("project-1");

    expect(sessions.map((session) => [session.id, session.availableCommands])).toEqual([
      ["legacy", undefined],
      ["empty-commands", []],
      ["with-commands", [{ name: "review", description: "Review code" }]],
    ]);
  });

  it("maps persisted config_options when listing sessions", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta({
        sessionId: "with-config",
        configOptions: [
          {
            type: "select",
            id: "model",
            name: "Model",
            currentValue: "sonnet",
            options: [{ value: "sonnet", name: "Sonnet" }],
          },
        ],
      }),
    ]);

    const sessions = await listSessions("project-1");

    expect(sessions[0]?.configOptions).toEqual([
      expect.objectContaining({ id: "model", currentValue: "sonnet" }),
    ]);
  });

  it("createSession writes probe configOptions and acpSessionId into new meta", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const probeOptions = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
    ];

    const session = await createSession({
      projectId: "project-1",
      title: "draft",
      agentId: "claude-acp",
      configOptions: probeOptions,
      availableCommands: [{ name: "review", description: "Review code" }],
      acpSessionId: "sess-A",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.acpSessionId).toBe("sess-A");
    expect(persistedMeta.configOptions).toEqual([
      expect.objectContaining({ id: "model", currentValue: "sonnet" }),
    ]);
    expect(persistedMeta.available_commands).toEqual([
      { name: "review", description: "Review code" },
    ]);
    expect(session.configOptions).toEqual(persistedMeta.configOptions);
    expect(session.availableCommands).toEqual(persistedMeta.available_commands);
  });

  it("createSession persists available_commands empty array without folding to undefined", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const session = await createSession({
      projectId: "project-1",
      title: "draft",
      agentId: "claude-acp",
      availableCommands: [],
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.available_commands).toEqual([]);
    expect(session.availableCommands).toEqual([]);
  });

  it("createSession leaves probe fields unset when caller omits them", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const session = await createSession({
      projectId: "project-1",
      title: "draft",
      agentId: "claude-acp",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.acpSessionId).toBeUndefined();
    expect(persistedMeta.configOptions).toBeUndefined();
    expect(persistedMeta.available_commands).toBeUndefined();
    expect(session.configOptions).toBeUndefined();
    expect(session.availableCommands).toBeUndefined();
  });
});
