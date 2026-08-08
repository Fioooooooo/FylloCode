import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SpawnedSessionMeta,
  SpawnedTurnRecord,
} from "@main/infra/storage/spawned-session-store";

const mocks = vi.hoisted(() => ({
  metas: new Map<string, SpawnedSessionMeta>(),
  turns: new Map<string, SpawnedTurnRecord>(),
  messages: [] as Array<{ owner: { sessionId: string }; message: unknown }>,
  responses: new Map<string, string>(),
  sessions: [] as Array<EventEmitter & { opts: Record<string, unknown> }>,
  start: vi.fn(),
  cancel: vi.fn(),
  failResponseWrite: false,
  failMessageRole: "" as "" | "user" | "assistant",
  failTurnPatchPhases: new Set<string>(),
  failMetaPatchStatuses: new Set<string>(),
  loadSessionMeta: vi.fn(),
  ensureSnapshot: vi.fn(),
  listAgents: vi.fn(),
  getAgentById: vi.fn(),
  readInstalledRecords: vi.fn(),
  getOrStartProcess: vi.fn(),
  getReadyProcess: vi.fn(),
  hasActiveAcpSession: vi.fn(),
  onInvalidated: vi.fn(),
  assertCompatibility: vi.fn(),
  invalidations: [] as Array<(event: { agentId: string; reason: string }) => void>,
  deleteSpawnedSessionParent: vi.fn(),
  suppressParent: vi.fn(),
  beginNotificationShutdown: vi.fn(),
  fenceParent: vi.fn(),
  beginStoreShutdown: vi.fn(),
}));

function key(owner: { workspaceId: string; parentSessionId: string; sessionId: string }): string {
  return `${owner.workspaceId}/${owner.parentSessionId}/${owner.sessionId}`;
}

function turnKey(
  owner: { workspaceId: string; parentSessionId: string; sessionId: string },
  turnId: string
): string {
  return `${key(owner)}/${turnId}`;
}

vi.mock("@main/infra/acp/agent-catalog", () => ({
  listAgents: mocks.listAgents,
  getAgentById: mocks.getAgentById,
}));

vi.mock("@main/infra/acp/detector", () => ({
  readInstalledRecords: mocks.readInstalledRecords,
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
  getReadyProcess: mocks.getReadyProcess,
  hasActiveAcpSession: mocks.hasActiveAcpSession,
  onAgentProcessInvalidated: mocks.onInvalidated,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: mocks.loadSessionMeta,
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  ensureSessionWorkspaceSnapshot: mocks.ensureSnapshot,
}));

vi.mock("@main/services/session/chat/agent-workspace-compatibility", () => ({
  assertAgentWorkspaceCompatibility: mocks.assertCompatibility,
}));

vi.mock("@main/infra/storage/spawned-session-store", async () => {
  const actual = await vi.importActual<typeof import("@main/infra/storage/spawned-session-store")>(
    "@main/infra/storage/spawned-session-store"
  );
  return {
    ...actual,
    loadSpawnedSessionMeta: vi.fn(async (owner) => mocks.metas.get(key(owner)) ?? null),
    writeSpawnedSessionMeta: vi.fn(async (meta: SpawnedSessionMeta) => {
      mocks.metas.set(key(meta), structuredClone(meta));
    }),
    patchSpawnedSessionMeta: vi.fn(async (owner, patch) => {
      const current = mocks.metas.get(key(owner));
      if (!current) return null;
      const delta = typeof patch === "function" ? patch(current) : patch;
      if (delta.status && mocks.failMetaPatchStatuses.has(delta.status)) {
        throw new Error(`meta ${delta.status} failed`);
      }
      const next = { ...current, ...delta } as SpawnedSessionMeta;
      mocks.metas.set(key(owner), structuredClone(next));
      return next;
    }),
    appendSpawnedSessionMessage: vi.fn(async (owner, message) => {
      const role = (message as { role?: string }).role;
      if (role === mocks.failMessageRole) throw new Error(`${role} message failed`);
      mocks.messages.push({ owner, message });
    }),
    createSpawnedTurnRecord: vi.fn(async (record: SpawnedTurnRecord) => {
      mocks.turns.set(turnKey(record, record.turnId), structuredClone(record));
    }),
    loadLatestSpawnedTurnRecord: vi.fn(async (owner) => {
      return (
        [...mocks.turns.values()]
          .filter(
            (record) =>
              record.workspaceId === owner.workspaceId &&
              record.parentSessionId === owner.parentSessionId &&
              record.sessionId === owner.sessionId
          )
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .at(-1) ?? null
      );
    }),
    patchSpawnedTurnRecord: vi.fn(async (owner, turnId, patch) => {
      const current = mocks.turns.get(turnKey(owner, turnId));
      if (!current) return null;
      const delta = typeof patch === "function" ? patch(current) : patch;
      if (delta.phase && mocks.failTurnPatchPhases.has(delta.phase)) {
        throw new Error(`turn ${delta.phase} failed`);
      }
      const next = { ...current, ...delta } as SpawnedTurnRecord;
      mocks.turns.set(turnKey(owner, turnId), structuredClone(next));
      return next;
    }),
    writeSpawnedSessionResponse: vi.fn(async (owner, responseId, content) => {
      if (mocks.failResponseWrite) throw new Error("response disk full");
      mocks.responses.set(`${key(owner)}/${responseId}`, content);
    }),
    readSpawnedSessionResponseChunk: vi.fn(async () => ({ content: "chunk", done: true })),
    fenceSpawnedSessionParent: mocks.fenceParent,
    deleteSpawnedSessionParent: mocks.deleteSpawnedSessionParent,
    beginSpawnedSessionStoreShutdown: mocks.beginStoreShutdown,
  };
});

vi.mock("@main/services/session/chat/acp-session", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class FakeAcpSession extends Emitter {
    constructor(public readonly opts: Record<string, unknown>) {
      super();
      mocks.sessions.push(this);
    }

    async start(): Promise<void> {
      const startPromise = Promise.resolve(mocks.start(this));
      const sessionStore = this.opts.sessionStore as
        { persistAcpSessionId(acpSessionId: string): Promise<void> } | undefined;
      await sessionStore?.persistAcpSessionId("acp-fake");
      const onPromptDispatched = this.opts.onPromptDispatched as
        ((input: { acpSessionId: string; configOptions: [] }) => Promise<void>) | undefined;
      await onPromptDispatched?.({ acpSessionId: "acp-fake", configOptions: [] });
      await startPromise;
    }

    cancel(): void {
      mocks.cancel(this);
    }
  }
  return { AcpSession: FakeAcpSession };
});

vi.mock("@main/services/session/spawn/spawn-notification-service", () => ({
  spawnNotificationService: {
    pendingNotification: (notificationId: string, updatedAt: string) => ({
      notificationId,
      state: "pending",
      updatedAt,
    }),
    terminalPersisted: vi.fn(),
    suppressParent: mocks.suppressParent,
    beginShutdown: mocks.beginNotificationShutdown,
  },
}));

import {
  MAX_ACTIVE_SPAWN_TURNS_GLOBAL,
  MAX_ACTIVE_SPAWN_TURNS_PER_PARENT,
  SPAWN_TURN_CANCEL_GRACE_MS,
  SPAWN_TURN_INACTIVITY_TIMEOUT_MS,
  SpawnedSessionManager,
} from "@main/services/session/spawn/spawned-session-manager";

const caller = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
const snapshot = {
  workspaceId: "workspace-1",
  workspaceKind: "folder" as const,
  primaryFolderId: "folder-1",
  folders: [
    { folderId: "folder-1", folderName: "Root", folderPath: "/repo" },
    { folderId: "folder-2", folderName: "Docs", folderPath: "/docs" },
  ],
  cwd: "/repo",
  additionalDirectories: ["/docs"],
};

function meta(sessionId: string, overrides: Partial<SpawnedSessionMeta> = {}): SpawnedSessionMeta {
  return {
    version: 1,
    ...caller,
    sessionId,
    agentId: "agent-1",
    acpSessionId: `acp-${sessionId}`,
    processGeneration: 0,
    workspaceSnapshot: snapshot,
    status: "idle",
    configOptions: [],
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

async function waitForSessions(count: number): Promise<void> {
  await vi.waitFor(() => expect(mocks.sessions).toHaveLength(count));
}

describe("SpawnedSessionManager", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.metas.clear();
    mocks.turns.clear();
    mocks.messages.length = 0;
    mocks.responses.clear();
    mocks.sessions.length = 0;
    mocks.failResponseWrite = false;
    mocks.failMessageRole = "";
    mocks.failTurnPatchPhases.clear();
    mocks.failMetaPatchStatuses.clear();
    mocks.invalidations.length = 0;
    mocks.loadSessionMeta.mockResolvedValue({ workspaceSnapshot: snapshot });
    mocks.ensureSnapshot.mockResolvedValue(snapshot);
    mocks.listAgents.mockResolvedValue([
      { id: "agent-1", name: "Agent One", source: "custom", registryEntry: { description: "A" } },
    ]);
    mocks.getAgentById.mockResolvedValue({ id: "agent-1", name: "Agent One", source: "custom" });
    mocks.readInstalledRecords.mockResolvedValue({});
    mocks.getOrStartProcess.mockResolvedValue({ agentId: "agent-1", generation: 0 });
    mocks.getReadyProcess.mockReturnValue({ agentId: "agent-1", generation: 0 });
    mocks.hasActiveAcpSession.mockReturnValue(true);
    mocks.assertCompatibility.mockResolvedValue(undefined);
    mocks.onInvalidated.mockImplementation((handler) => {
      mocks.invalidations.push(handler);
      return () => {
        const index = mocks.invalidations.indexOf(handler);
        if (index >= 0) mocks.invalidations.splice(index, 1);
      };
    });
    mocks.deleteSpawnedSessionParent.mockResolvedValue(undefined);
    mocks.suppressParent.mockResolvedValue(undefined);
    mocks.start.mockImplementation(async (session: EventEmitter) => {
      session.emit("event", { kind: "text_delta", text: "done" });
      session.emit("event", { kind: "done", totalTokens: 2 });
    });
  });

  it("列出可用 Agent 时不启动进程", async () => {
    const manager = new SpawnedSessionManager();
    await expect(manager.availableAgents(caller)).resolves.toEqual({
      agents: [{ agentId: "agent-1", name: "Agent One", description: "A" }],
    });
    expect(mocks.getOrStartProcess).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it("在启动 AgentProcess 前透传 stale snapshot 与 multi-root capability 错误", async () => {
    const manager = new SpawnedSessionManager();
    mocks.ensureSnapshot.mockRejectedValueOnce(
      Object.assign(new Error("folder moved"), { code: "SESSION_FOLDER_RELOCATED" })
    );
    await expect(
      manager.promptToAgent(caller, { agentId: "agent-1", prompt: "work" })
    ).rejects.toMatchObject({ code: "SESSION_FOLDER_RELOCATED" });
    expect(mocks.getOrStartProcess).not.toHaveBeenCalled();

    mocks.assertCompatibility.mockRejectedValueOnce(
      Object.assign(new Error("multi-root unsupported"), {
        code: "PROMPT_CAPABILITY_MISMATCH",
      })
    );
    await expect(
      manager.promptToAgent(caller, { agentId: "agent-1", prompt: "work" })
    ).rejects.toMatchObject({ code: "PROMPT_CAPABILITY_MISMATCH" });
    expect(mocks.getOrStartProcess).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it("续聊接受 generation 0，并固定继承父 Session 的 multi-root snapshot", async () => {
    mocks.metas.set(key({ ...caller, sessionId: "spawn-1" }), meta("spawn-1"));
    const manager = new SpawnedSessionManager();

    const result = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "continue",
      sessionId: "spawn-1",
    });

    expect(result).toMatchObject({ status: "completed", sessionId: "spawn-1", content: "done" });
    expect(mocks.getOrStartProcess).not.toHaveBeenCalled();
    expect(mocks.sessions[0]?.opts).toMatchObject({
      cwd: "/repo",
      additionalDirectories: ["/docs"],
      owner: "spawn",
    });
    expect(mocks.messages.map(({ message }) => (message as { role: string }).role)).toEqual([
      "user",
      "assistant",
    ]);
    await manager.dispose();
  });

  it("在第一个异步边界前占位，同一 spawned Session 的并发请求返回 busy", async () => {
    mocks.metas.set(key({ ...caller, sessionId: "spawn-1" }), meta("spawn-1"));
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    manager.start();
    const controller = new AbortController();

    const first = manager.promptToAgent(
      caller,
      { agentId: "agent-1", prompt: "first", sessionId: "spawn-1" },
      controller.signal
    );
    const second = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "second",
      sessionId: "spawn-1",
    });

    expect(second).toMatchObject({ status: "busy", sessionId: "spawn-1" });
    await expect(manager.checkSessionStatus(caller, "spawn-1")).resolves.toMatchObject({
      status: "running",
    });
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: "SPAWN_RPC_CANCELLED" });
    await manager.dispose();
  });

  it("全局 active turn 达到 8 时拒绝，但顺序累计创建不受限制", async () => {
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    const controllers = Array.from(
      { length: MAX_ACTIVE_SPAWN_TURNS_GLOBAL },
      () => new AbortController()
    );
    const running = controllers.map((controller, index) => {
      const owner = { workspaceId: "workspace-1", parentSessionId: `parent-${index}` };
      const sessionId = `global-${index}`;
      mocks.metas.set(key({ ...owner, sessionId }), meta(sessionId, owner));
      return manager.promptToAgent(
        owner,
        { agentId: "agent-1", prompt: "run", sessionId },
        controller.signal
      );
    });
    await waitForSessions(MAX_ACTIVE_SPAWN_TURNS_GLOBAL);

    await expect(
      manager.promptToAgent(
        { workspaceId: "workspace-1", parentSessionId: "parent-extra" },
        { agentId: "agent-1", prompt: "extra" }
      )
    ).resolves.toMatchObject({ status: "capacity_exceeded", retryable: true });

    controllers.forEach((controller) => controller.abort());
    await Promise.allSettled(running);
    mocks.start.mockImplementation(async (session: EventEmitter) => {
      session.emit("event", { kind: "done", totalTokens: 0 });
    });
    for (let index = 0; index < 33; index += 1) {
      await expect(
        manager.promptToAgent(caller, { agentId: "agent-1", prompt: `sequential-${index}` })
      ).resolves.toMatchObject({ status: "completed" });
    }
    await manager.dispose();
  });

  it("父 Session active turn 达到 4 时立即拒绝且不排队", async () => {
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    const controllers = Array.from(
      { length: MAX_ACTIVE_SPAWN_TURNS_PER_PARENT },
      () => new AbortController()
    );
    const running = controllers.map((controller, index) => {
      const sessionId = `spawn-${index}`;
      mocks.metas.set(key({ ...caller, sessionId }), meta(sessionId));
      return manager.promptToAgent(
        caller,
        { agentId: "agent-1", prompt: "run", sessionId },
        controller.signal
      );
    });

    await waitForSessions(MAX_ACTIVE_SPAWN_TURNS_PER_PARENT);
    const rejected = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "extra",
    });
    expect(rejected).toEqual({
      status: "capacity_exceeded",
      code: "SPAWN_CAPACITY_EXCEEDED",
      retryable: true,
    });

    controllers.forEach((controller) => controller.abort());
    await Promise.allSettled(running);
    await manager.dispose();
  });

  it("response 持久化失败时返回 error，且 meta 不会误报 idle", async () => {
    mocks.failResponseWrite = true;
    const manager = new SpawnedSessionManager();

    const result = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "persist",
    });

    expect(result).toMatchObject({
      status: "error",
      code: "TURN_PERSIST_FAILED",
      message: "response disk full",
    });
    const stored = [...mocks.metas.values()][0];
    expect(stored).toMatchObject({ status: "error", error: { code: "TURN_PERSIST_FAILED" } });
    await manager.dispose();
  });

  it("config schema 校验失败以 RPC error 返回，不降级成普通 turn failure", async () => {
    mocks.start.mockImplementation(async (session: EventEmitter) => {
      session.emit("event", {
        kind: "error",
        code: "SPAWN_INVALID_REQUEST",
        message: "Unknown config option: model",
      });
    });
    const manager = new SpawnedSessionManager();

    await expect(
      manager.promptToAgent(caller, {
        agentId: "agent-1",
        prompt: "configure",
        config: { model: "missing" },
      })
    ).rejects.toMatchObject({
      code: "SPAWN_INVALID_REQUEST",
      message: "Unknown config option: model",
    });
    await manager.dispose();
  });

  it("跨 owner 查询与读取统一隐藏为 not_found", async () => {
    mocks.metas.set(key({ ...caller, sessionId: "spawn-1" }), meta("spawn-1"));
    const manager = new SpawnedSessionManager();
    const other = { workspaceId: "workspace-1", parentSessionId: "parent-2" };

    await expect(manager.checkSessionStatus(other, "spawn-1")).resolves.toEqual({
      status: "not_found",
    });
    await expect(
      manager.readResponse(other, { sessionId: "spawn-1", responseId: "response-1" })
    ).rejects.toMatchObject({ code: "SPAWN_NOT_FOUND" });
    await manager.dispose();
  });

  it("Agent process 失效会立即取消运行 turn，并把已完成 Session 标记 expired", async () => {
    mocks.metas.set(key({ ...caller, sessionId: "running" }), meta("running"));
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    manager.start();
    const running = manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "run",
      sessionId: "running",
    });
    await waitForSessions(1);

    mocks.invalidations.at(-1)?.({ agentId: "agent-1", reason: "process exited" });
    await expect(running).resolves.toEqual({
      status: "expired",
      sessionId: "running",
      code: "AGENT_PROCESS_INVALIDATED",
      message: "process exited",
    });
    expect(mocks.cancel).toHaveBeenCalledOnce();

    mocks.start.mockImplementation(async (session: EventEmitter) => {
      session.emit("event", { kind: "done", totalTokens: 0 });
    });
    const completed = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "complete",
    });
    expect(completed.status).toBe("completed");
    const completedSessionId = "sessionId" in completed ? completed.sessionId : "";
    mocks.invalidations.at(-1)?.({ agentId: "agent-1", reason: "restarted" });
    await vi.waitFor(() =>
      expect(mocks.metas.get(key({ ...caller, sessionId: completedSessionId }))).toMatchObject({
        status: "expired",
      })
    );
    await manager.dispose();
  });

  it("background accepted 后 AgentProcess 失效会 durable expired 并建立错误通知", async () => {
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    manager.start();
    const accepted = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "background",
      background: true,
    });
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") throw new Error("expected accepted");

    mocks.invalidations.at(-1)?.({ agentId: "agent-1", reason: "generation replaced" });
    await vi.waitFor(() =>
      expect(
        mocks.turns.get(turnKey(callerWithSession(accepted.sessionId), accepted.turnId))
      ).toMatchObject({
        phase: "expired",
        error: { code: "AGENT_PROCESS_INVALIDATED" },
        notification: { state: "pending" },
      })
    );
    await expect(manager.checkSessionStatus(caller, accepted.sessionId)).resolves.toMatchObject({
      status: "expired",
      code: "AGENT_PROCESS_INVALIDATED",
    });
    await manager.dispose();
  });

  it("删除父 Session 会 fence 新请求、取消关联 turn，并等待结算后删除数据", async () => {
    mocks.metas.set(key({ ...caller, sessionId: "running" }), meta("running"));
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    const running = manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "run",
      sessionId: "running",
    });
    await waitForSessions(1);

    await manager.deleteParent(caller.workspaceId, caller.parentSessionId);
    await expect(running).resolves.toEqual({ status: "expired", sessionId: "running" });
    expect(mocks.deleteSpawnedSessionParent).toHaveBeenCalledWith(
      caller.workspaceId,
      caller.parentSessionId
    );
    expect(mocks.suppressParent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fenceParent.mock.invocationCallOrder[0]!
    );
    expect(mocks.fenceParent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteSpawnedSessionParent.mock.invocationCallOrder[0]!
    );
    await expect(
      manager.promptToAgent(caller, { agentId: "agent-1", prompt: "late" })
    ).rejects.toMatchObject({ code: "SPAWN_PARENT_SESSION_NOT_FOUND" });
    await manager.dispose();
  });

  it("shutdown 在 store 可写时把 background turn 持久化为 APP_SHUTDOWN 后再 fence", async () => {
    mocks.start.mockImplementation(() => new Promise<void>(() => undefined));
    const manager = new SpawnedSessionManager();
    const accepted = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "background",
      background: true,
    });
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") throw new Error("expected accepted");

    await manager.dispose();

    expect(
      mocks.turns.get(turnKey(callerWithSession(accepted.sessionId), accepted.turnId))
    ).toMatchObject({
      phase: "interrupted",
      error: { code: "APP_SHUTDOWN" },
      notification: { state: "pending" },
    });
    const interruptedPatchOrder = vi
      .mocked(await import("@main/infra/storage/spawned-session-store"))
      .patchSpawnedTurnRecord.mock.invocationCallOrder.at(-1)!;
    expect(interruptedPatchOrder).toBeLessThan(
      mocks.beginStoreShutdown.mock.invocationCallOrder[0]!
    );
    expect(mocks.beginNotificationShutdown).toHaveBeenCalledOnce();
  });

  it("有事件时重置 inactivity timer，无事件 10 分钟后取消并等待 grace", async () => {
    vi.useFakeTimers();
    let settleStart!: () => void;
    mocks.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleStart = resolve;
        })
    );
    mocks.cancel.mockImplementation(() => settleStart());
    const manager = new SpawnedSessionManager();
    const request = manager.promptToAgent(caller, { agentId: "agent-1", prompt: "long" });
    for (let index = 0; index < 50 && mocks.sessions.length === 0; index += 1) {
      await Promise.resolve();
    }
    expect(mocks.sessions).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(SPAWN_TURN_INACTIVITY_TIMEOUT_MS - 1);
    mocks.sessions[0]?.emit("event", { kind: "reasoning_delta", text: "still working" });
    await vi.advanceTimersByTimeAsync(SPAWN_TURN_INACTIVITY_TIMEOUT_MS - 1);
    expect(mocks.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(SPAWN_TURN_CANCEL_GRACE_MS);

    await expect(request).resolves.toMatchObject({
      status: "error",
      code: "TURN_INACTIVITY_TIMEOUT",
    });
    expect(mocks.cancel).toHaveBeenCalledOnce();
    mocks.sessions[0]?.emit("event", { kind: "text_delta", text: "late" });
    await expect(
      manager.checkSessionStatus(caller, [...mocks.metas.values()][0]!.sessionId)
    ).resolves.toMatchObject({
      status: "error",
      code: "TURN_INACTIVITY_TIMEOUT",
    });
    await manager.dispose();
  });

  it("持续 ACP activity 可运行超过多个 inactivity 窗口且没有绝对时长取消", async () => {
    vi.useFakeTimers();
    let settleStart!: () => void;
    mocks.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleStart = resolve;
        })
    );
    const manager = new SpawnedSessionManager();
    const request = manager.promptToAgent(caller, { agentId: "agent-1", prompt: "long active" });
    for (let index = 0; index < 50 && mocks.sessions.length === 0; index += 1) {
      await Promise.resolve();
    }

    for (let window = 0; window < 3; window += 1) {
      await vi.advanceTimersByTimeAsync(SPAWN_TURN_INACTIVITY_TIMEOUT_MS - 1);
      mocks.sessions[0]?.emit("event", { kind: "usage_update", used: window + 1, size: 10 });
    }
    expect(mocks.cancel).not.toHaveBeenCalled();
    mocks.sessions[0]?.emit("event", { kind: "done", totalTokens: 3 });
    settleStart();
    await expect(request).resolves.toMatchObject({ status: "completed" });
    await manager.dispose();
  });

  it("background 在 prompt dispatched 后返回 accepted，且断连不取消并持续占用 busy", async () => {
    let settleStart!: () => void;
    let runningSession!: EventEmitter;
    mocks.start.mockImplementation(
      (session: EventEmitter) =>
        new Promise<void>((resolve) => {
          runningSession = session;
          settleStart = resolve;
        })
    );
    const manager = new SpawnedSessionManager();
    const controller = new AbortController();

    const accepted = await manager.promptToAgent(
      caller,
      { agentId: "agent-1", prompt: "background", background: true },
      controller.signal
    );

    expect(accepted).toMatchObject({
      status: "accepted",
      sessionId: expect.any(String),
      turnId: expect.any(String),
      config: [],
      warnings: [],
    });
    if (accepted.status !== "accepted") throw new Error("expected accepted");
    await expect(manager.checkSessionStatus(caller, accepted.sessionId)).resolves.toMatchObject({
      status: "running",
      turnId: accepted.turnId,
      mode: "background",
    });
    await expect(
      manager.promptToAgent(caller, {
        agentId: "agent-1",
        prompt: "duplicate",
        sessionId: accepted.sessionId,
      })
    ).resolves.toMatchObject({ status: "busy" });

    controller.abort();
    expect(mocks.cancel).not.toHaveBeenCalled();
    runningSession.emit("event", { kind: "done", totalTokens: 1 });
    settleStart();
    await vi.waitFor(() =>
      expect(
        mocks.turns.get(turnKey(callerWithSession(accepted.sessionId), accepted.turnId))
      ).toMatchObject({
        phase: "completed",
        notification: { state: "pending" },
      })
    );
    await expect(manager.checkSessionStatus(caller, accepted.sessionId)).resolves.toMatchObject({
      status: "idle",
      latestTurnId: accepted.turnId,
      latestResponseId: expect.any(String),
    });
    await manager.dispose();
  });

  it("background accepted 后仍计入父级 active 4 容量，terminal 后释放", async () => {
    const pending: Array<{ session: EventEmitter; resolve: () => void }> = [];
    mocks.start.mockImplementation(
      (session: EventEmitter) =>
        new Promise<void>((resolve) => {
          pending.push({ session, resolve });
        })
    );
    const manager = new SpawnedSessionManager();
    const accepted = await Promise.all(
      Array.from({ length: MAX_ACTIVE_SPAWN_TURNS_PER_PARENT }, (_, index) =>
        manager.promptToAgent(caller, {
          agentId: "agent-1",
          prompt: `background-${index}`,
          background: true,
        })
      )
    );
    expect(accepted.every((result) => result.status === "accepted")).toBe(true);
    await expect(
      manager.promptToAgent(caller, {
        agentId: "agent-1",
        prompt: "over capacity",
        background: true,
      })
    ).resolves.toMatchObject({ status: "capacity_exceeded" });

    pending[0]?.session.emit("event", { kind: "done", totalTokens: 0 });
    pending[0]?.resolve();
    await vi.waitFor(() =>
      expect(
        [...mocks.turns.values()].filter((record) => record.phase === "completed")
      ).toHaveLength(1)
    );
    await expect(
      manager.promptToAgent(caller, {
        agentId: "agent-1",
        prompt: "capacity released",
        background: true,
      })
    ).resolves.toMatchObject({ status: "accepted" });

    for (const item of pending) {
      item.session.emit("event", { kind: "done", totalTokens: 0 });
      item.resolve();
    }
    await manager.dispose();
  });

  it("极快 terminal 会等待 accepted durable write 后再写 completed", async () => {
    const manager = new SpawnedSessionManager();
    const result = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "fast",
      background: true,
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    await vi.waitFor(() =>
      expect(
        mocks.turns.get(turnKey(callerWithSession(result.sessionId), result.turnId))
      ).toMatchObject({
        phase: "completed",
      })
    );
    await manager.dispose();
  });

  it("accepted running record 持久化失败时不返回 accepted，并收敛为 error", async () => {
    mocks.failTurnPatchPhases.add("running");
    const manager = new SpawnedSessionManager();

    await expect(
      manager.promptToAgent(caller, {
        agentId: "agent-1",
        prompt: "cannot accept",
        background: true,
      })
    ).rejects.toMatchObject({ code: "SPAWN_INTERNAL_ERROR" });
    expect([...mocks.turns.values()][0]).toMatchObject({ phase: "error" });
    await manager.dispose();
  });

  it.each([
    ["assistant message", () => (mocks.failMessageRole = "assistant")],
    ["response", () => (mocks.failResponseWrite = true)],
    ["completed turn", () => mocks.failTurnPatchPhases.add("completed")],
    ["idle meta", () => mocks.failMetaPatchStatuses.add("idle")],
  ])("%s terminal 写失败不会留下 completed response 引用", async (_label, fail) => {
    fail();
    const manager = new SpawnedSessionManager();
    const result = await manager.promptToAgent(caller, {
      agentId: "agent-1",
      prompt: "fault injection",
    });

    expect(result).toMatchObject({ status: "error", code: "TURN_PERSIST_FAILED" });
    const turn = [...mocks.turns.values()][0];
    expect(turn).toMatchObject({
      phase: "error",
      error: { code: "TURN_PERSIST_FAILED" },
    });
    expect(turn?.responseId).toBeUndefined();
    await manager.dispose();
  });
});

function callerWithSession(sessionId: string) {
  return { ...caller, sessionId };
}
