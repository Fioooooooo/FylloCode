import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  listSessionMetas: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  createSessionMeta: vi.fn(),
  newSessionId: vi.fn(),
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

vi.mock("@main/infra/ids", () => ({
  newSessionId: mocks.newSessionId,
}));

import {
  createSession,
  listSessions,
  setSessionActionState,
} from "@main/services/chat/chat-service";

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
    mocks.newSessionId.mockReturnValue("session-generated");
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

  it("maps persisted actionStates when listing sessions", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta({
        actionStates: {
          "chat:session-1:0:0:0": {
            type: "task.create",
            status: "succeeded",
            updatedAt: "2026-06-08T00:00:00.000Z",
          },
        },
      }),
    ]);

    const sessions = await listSessions("project-1");

    expect(sessions[0]?.actionStates).toEqual({
      "chat:session-1:0:0:0": {
        type: "task.create",
        status: "succeeded",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    });
  });

  it("setSessionActionState merges one action state without dropping existing states", async () => {
    const currentMeta = meta({
      actionStates: {
        "chat:session-1:0:0:0": {
          type: "task.create",
          status: "succeeded",
          updatedAt: "2026-06-08T00:00:00.000Z",
        },
      },
      available_commands: [{ name: "review", description: "Review code" }],
      configOptions: [],
    });
    mocks.patchSessionMeta.mockImplementation(async (_projectPath, _sessionId, patch) => {
      const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
      return {
        ...currentMeta,
        ...nextPatch,
      };
    });

    await expect(
      setSessionActionState({
        projectId: "project-1",
        sessionId: "session-1",
        actionId: "chat:session-1:0:0:1",
        state: {
          type: "task.create",
          status: "cancelled",
          updatedAt: "2026-06-08T00:00:01.000Z",
        },
      })
    ).resolves.toEqual({
      actionStates: {
        "chat:session-1:0:0:0": {
          type: "task.create",
          status: "succeeded",
          updatedAt: "2026-06-08T00:00:00.000Z",
        },
        "chat:session-1:0:0:1": {
          type: "task.create",
          status: "cancelled",
          updatedAt: "2026-06-08T00:00:01.000Z",
        },
      },
    });

    expect(mocks.patchSessionMeta).toHaveBeenCalledWith(
      "/tmp/project",
      "session-1",
      expect.any(Function)
    );
    const patchFn = mocks.patchSessionMeta.mock.calls[0]![2] as (input: SessionMeta) => unknown;
    expect(patchFn(currentMeta)).toMatchObject({
      actionStates: {
        "chat:session-1:0:0:0": currentMeta.actionStates?.["chat:session-1:0:0:0"],
        "chat:session-1:0:0:1": {
          type: "task.create",
          status: "cancelled",
          updatedAt: "2026-06-08T00:00:01.000Z",
        },
      },
      updatedAt: expect.any(String),
    });
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

  it("createSession reuses provided fylloSessionId for probe-origin sessions", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const session = await createSession({
      projectId: "project-1",
      title: "draft",
      agentId: "claude-acp",
      fylloSessionId: "session-probe",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.sessionId).toBe("session-probe");
    expect(session.id).toBe("session-probe");
    expect(mocks.newSessionId).not.toHaveBeenCalled();
    expect(persistedMeta).not.toHaveProperty("fylloSessionId");
  });

  it("createSession generates a sessionId when fylloSessionId is omitted", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const session = await createSession({
      projectId: "project-1",
      title: "draft",
      agentId: "claude-acp",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(mocks.newSessionId).toHaveBeenCalledTimes(1);
    expect(persistedMeta.sessionId).toBe("session-generated");
    expect(session.id).toBe("session-generated");
  });

  it("createSession persists taskRef together with a probe-origin fylloSessionId", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    await createSession({
      projectId: "project-1",
      title: "draft",
      agentId: "claude-acp",
      fylloSessionId: "session-probe",
      taskRef: "local:TASK-1",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.sessionId).toBe("session-probe");
    expect(persistedMeta.originTaskRef).toBe("local:TASK-1");
    expect(persistedMeta).not.toHaveProperty("fylloSessionId");
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
