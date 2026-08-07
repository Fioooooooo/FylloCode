import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnedSessionMeta } from "@main/infra/storage/spawned-session-store";

const mocks = vi.hoisted(() => ({
  metas: new Map<string, SpawnedSessionMeta>(),
  messages: [] as Array<{ owner: { sessionId: string }; message: unknown }>,
  responses: new Map<string, string>(),
  sessions: [] as Array<EventEmitter & { opts: Record<string, unknown> }>,
  start: vi.fn(),
  cancel: vi.fn(),
  failResponseWrite: false,
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
}));

function key(owner: { workspaceId: string; parentSessionId: string; sessionId: string }): string {
  return `${owner.workspaceId}/${owner.parentSessionId}/${owner.sessionId}`;
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
      const next = { ...current, ...delta } as SpawnedSessionMeta;
      mocks.metas.set(key(owner), structuredClone(next));
      return next;
    }),
    appendSpawnedSessionMessage: vi.fn(async (owner, message) => {
      mocks.messages.push({ owner, message });
    }),
    writeSpawnedSessionResponse: vi.fn(async (owner, responseId, content) => {
      if (mocks.failResponseWrite) throw new Error("response disk full");
      mocks.responses.set(`${key(owner)}/${responseId}`, content);
    }),
    readSpawnedSessionResponseChunk: vi.fn(async () => ({ content: "chunk", done: true })),
    fenceSpawnedSessionParent: vi.fn(),
    deleteSpawnedSessionParent: mocks.deleteSpawnedSessionParent,
    beginSpawnedSessionStoreShutdown: vi.fn(),
  };
});

vi.mock("@main/services/session/chat/acp-session", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class FakeAcpSession extends Emitter {
    constructor(public readonly opts: Record<string, unknown>) {
      super();
      mocks.sessions.push(this);
    }

    start(): Promise<void> {
      return mocks.start(this);
    }

    cancel(): void {
      mocks.cancel(this);
    }
  }
  return { AcpSession: FakeAcpSession };
});

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
    mocks.messages.length = 0;
    mocks.responses.clear();
    mocks.sessions.length = 0;
    mocks.failResponseWrite = false;
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
      code: "TURN_FAILED",
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
    await expect(running).resolves.toEqual({ status: "expired", sessionId: "running" });
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
    await expect(
      manager.promptToAgent(caller, { agentId: "agent-1", prompt: "late" })
    ).rejects.toMatchObject({ code: "SPAWN_PARENT_SESSION_NOT_FOUND" });
    await manager.dispose();
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
    await manager.dispose();
  });
});
