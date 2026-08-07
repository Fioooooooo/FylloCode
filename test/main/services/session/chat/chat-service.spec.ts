import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";
import type { ResolvedWorkspace, SessionWorkspaceSnapshot } from "@shared/types/workspace";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  listSessionMetas: vi.fn(),
  loadSessionMeta: vi.fn(),
  patchSessionMeta: vi.fn(),
  createSessionMeta: vi.fn(),
  newSessionId: vi.fn(),
  resolveWorkspace: vi.fn(),
  assertSessionWorkspaceSnapshotCurrent: vi.fn(),
  deleteSession: vi.fn(),
  deleteSpawnedSessionsForParent: vi.fn(),
}));

vi.mock("@main/infra/storage/project-store", () => ({
  loadProject: mocks.loadProject,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  appendMessage: vi.fn(),
  createSessionMeta: mocks.createSessionMeta,
  deleteSession: mocks.deleteSession,
  listSessionMetas: mocks.listSessionMetas,
  loadMessages: vi.fn(),
  loadSessionMeta: mocks.loadSessionMeta,
  patchSessionMeta: mocks.patchSessionMeta,
}));

vi.mock("@main/infra/ids", () => ({
  newSessionId: mocks.newSessionId,
}));

vi.mock("@main/services/workspace/_public", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@main/services/session/chat/session-workspace-service", () => ({
  assertSessionWorkspaceSnapshotCurrent: mocks.assertSessionWorkspaceSnapshotCurrent,
}));

vi.mock("@main/services/session/spawn/spawn-parent-lifecycle", () => ({
  deleteSpawnedSessionsForParent: mocks.deleteSpawnedSessionsForParent,
}));

import {
  assertSessionBelongsToWorkspace,
  createSession,
  ensureSessionWorkspaceSnapshot,
  listSessions,
  removeSession,
  updateSession,
} from "@main/services/session/chat/chat-service";

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    agentId: "claude-acp",
    sessionMode: "fyllocode",
    title: "Session",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

function resolvedWorkspace(overrides: Partial<ResolvedWorkspace> = {}): ResolvedWorkspace {
  return {
    workspaceId: "workspace-1",
    workspaceName: "Workspace",
    workspaceKind: "folder",
    workspaceDataDir: "/tmp/workspace-data",
    primaryFolderId: "folder-1",
    folders: [
      {
        folderId: "folder-1",
        folderName: "Project",
        folderPath: "/tmp/project",
        pathMissing: false,
      },
    ],
    availableFolders: [
      {
        folderId: "folder-1",
        folderName: "Project",
        folderPath: "/tmp/project",
        pathMissing: false,
      },
    ],
    missingFolders: [],
    cwd: "/tmp/project",
    additionalDirectories: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<SessionWorkspaceSnapshot> = {}): SessionWorkspaceSnapshot {
  return {
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "Project", folderPath: "/tmp/project" }],
    cwd: "/tmp/project",
    additionalDirectories: [],
    ...overrides,
  };
}

describe("chat-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProject.mockResolvedValue({ id: "workspace-1", path: "/tmp/project" });
    mocks.newSessionId.mockReturnValue("session-generated");
    mocks.resolveWorkspace.mockResolvedValue(resolvedWorkspace());
    mocks.assertSessionWorkspaceSnapshotCurrent.mockImplementation(async (value) => value);
  });

  it("删除父 Session 时先清理 spawned Sessions，再删除父级持久化", async () => {
    await removeSession({ workspaceId: "workspace-1", id: "session-1" });

    expect(mocks.deleteSpawnedSessionsForParent).toHaveBeenCalledWith("workspace-1", "session-1");
    expect(mocks.deleteSession).toHaveBeenCalledWith("workspace-1", "session-1");
    expect(mocks.deleteSpawnedSessionsForParent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteSession.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("rejects a Session comparison context outside the scoped Workspace store", async () => {
    mocks.loadSessionMeta.mockResolvedValue(null);

    await expect(
      assertSessionBelongsToWorkspace("workspace-1", "session-from-another-workspace")
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED });
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

    const sessions = await listSessions("workspace-1");

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

    const sessions = await listSessions("workspace-1");

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
            revision: 1,
            updatedAt: "2026-06-08T00:00:00.000Z",
          },
        },
      }),
    ]);

    const sessions = await listSessions("workspace-1");

    expect(sessions[0]?.actionStates).toEqual({
      "chat:session-1:0:0:0": {
        type: "task.create",
        status: "succeeded",
        revision: 1,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    });
  });

  it("maps missing and persisted pin state when listing sessions", async () => {
    mocks.listSessionMetas.mockResolvedValue([
      meta({ sessionId: "legacy" }),
      meta({ sessionId: "pinned", isPinned: true }),
    ]);

    const sessions = await listSessions("workspace-1");

    expect(sessions.map((session) => [session.id, session.isPinned])).toEqual([
      ["legacy", false],
      ["pinned", true],
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
      workspaceId: "workspace-1",
      title: "draft",
      agentId: "claude-acp",
      configOptions: probeOptions,
      availableCommands: [{ name: "review", description: "Review code" }],
      acpSessionId: "sess-A",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.acpSessionId).toBe("sess-A");
    expect(persistedMeta.sessionMode).toBe("fyllocode");
    expect(persistedMeta.configOptions).toEqual([
      expect.objectContaining({ id: "model", currentValue: "sonnet" }),
    ]);
    expect(persistedMeta.available_commands).toEqual([
      { name: "review", description: "Review code" },
    ]);
    expect(session.configOptions).toEqual(persistedMeta.configOptions);
    expect(session.availableCommands).toEqual(persistedMeta.available_commands);
    expect(session.isPinned).toBe(false);
    expect(session.workspaceSnapshot).toEqual(snapshot());
    expect(persistedMeta.workspaceSnapshot).toEqual(snapshot());
  });

  it("createSession reuses the probe snapshot without resolving the current Workspace", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);
    const probeSnapshot = snapshot({
      workspaceKind: "collection",
      folders: [
        { folderId: "folder-1", folderName: "Primary", folderPath: "/tmp/primary" },
        { folderId: "folder-2", folderName: "Secondary", folderPath: "/tmp/secondary" },
      ],
      cwd: "/tmp/primary",
      additionalDirectories: ["/tmp/secondary"],
    });

    const session = await createSession({
      workspaceId: "workspace-1",
      title: "draft",
      agentId: "claude-acp",
      acpSessionId: "acp-probe",
      workspaceSnapshot: probeSnapshot,
    });

    expect(mocks.resolveWorkspace).not.toHaveBeenCalled();
    expect(mocks.createSessionMeta.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ workspaceSnapshot: probeSnapshot })
    );
    expect(session.workspaceSnapshot).toEqual(probeSnapshot);
  });

  it("createSession persists native mode and returns it to the renderer", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const session = await createSession({
      workspaceId: "workspace-1",
      title: "native draft",
      agentId: "claude-acp",
      sessionMode: "native",
    });

    const persistedMeta = mocks.createSessionMeta.mock.calls[0]![1] as SessionMeta;
    expect(persistedMeta.sessionMode).toBe("native");
    expect(session.sessionMode).toBe("native");
  });

  it("maps a legacy meta without sessionMode to fyllocode", async () => {
    mocks.listSessionMetas.mockResolvedValue([meta({ sessionMode: undefined })]);

    const sessions = await listSessions("workspace-1");

    expect(sessions[0]?.sessionMode).toBe("fyllocode");
  });

  it("ensureSessionWorkspaceSnapshot lazily backfills a legacy Folder Session", async () => {
    const legacy = meta();
    mocks.loadSessionMeta.mockResolvedValue(legacy);
    mocks.patchSessionMeta.mockImplementation(async (_workspaceId, _sessionId, patch) => ({
      ...legacy,
      ...patch,
    }));

    const result = await ensureSessionWorkspaceSnapshot("workspace-1", "session-1");

    expect(mocks.patchSessionMeta).toHaveBeenCalledWith("workspace-1", "session-1", {
      workspaceSnapshot: snapshot(),
    });
    expect(mocks.assertSessionWorkspaceSnapshotCurrent).toHaveBeenCalledWith(snapshot());
    expect(result).toEqual(snapshot());
  });

  it("ensureSessionWorkspaceSnapshot rejects a legacy Collection Session", async () => {
    mocks.loadSessionMeta.mockResolvedValue(meta());
    mocks.resolveWorkspace.mockResolvedValue(resolvedWorkspace({ workspaceKind: "collection" }));

    await expect(ensureSessionWorkspaceSnapshot("workspace-1", "session-1")).rejects.toMatchObject({
      code: IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED,
    });
    expect(mocks.patchSessionMeta).not.toHaveBeenCalled();
  });

  it("persists pin state without changing updatedAt", async () => {
    const existing = meta({ updatedAt: "2026-05-14T00:00:00.000Z" });
    mocks.loadSessionMeta.mockResolvedValue(existing);
    mocks.patchSessionMeta.mockImplementation(async (_path, _sessionId, patch) => ({
      ...existing,
      ...(typeof patch === "function" ? patch(existing) : patch),
    }));

    const updated = await updateSession({
      id: "session-1",
      workspaceId: "workspace-1",
      patch: { isPinned: true },
    });

    expect(mocks.patchSessionMeta).toHaveBeenCalledWith("workspace-1", "session-1", {
      isPinned: true,
    });
    expect(updated.isPinned).toBe(true);
    expect(updated.updatedAt.toISOString()).toBe(existing.updatedAt);
  });

  it("createSession reuses provided fylloSessionId for probe-origin sessions", async () => {
    mocks.createSessionMeta.mockImplementation(async (_path, m) => m);

    const session = await createSession({
      workspaceId: "workspace-1",
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
      workspaceId: "workspace-1",
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
      workspaceId: "workspace-1",
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
      workspaceId: "workspace-1",
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
      workspaceId: "workspace-1",
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
