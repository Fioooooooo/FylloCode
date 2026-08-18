import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
import { useAcpAgentsStore } from "@renderer/stores/platform/acp-agents";
import { useChatStore } from "@renderer/stores/session/chat";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import { useSessionStore } from "@renderer/stores/session/session";
import {
  chatApi,
  type SpawnNotificationStreamCallbacks,
  type StreamCallbacks,
} from "@renderer/api/session/chat";
import { workspaceApi } from "@renderer/api/workspace/workspace";
import { workspaceInfo } from "../../fixtures/workspace";
import type { AcpRegistry, AcpAgentStatus } from "@shared/types/acp-agent";
import type { Session } from "@shared/types/chat";
import type { SpawnNotificationSummary } from "@shared/ipc/session/chat.schemas";

vi.mock("@renderer/api/session/chat", () => ({
  chatApi: {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    removeSession: vi.fn(),
    updateSession: vi.fn(),
    loadMessages: vi.fn(),
    persistMessage: vi.fn(),
    streamMessage: vi.fn(),
    saveAttachment: vi.fn(),
    setConfigOption: vi.fn(),
    probeEnsure: vi.fn(),
    probeClose: vi.fn(),
    probeSetConfigOption: vi.fn(),
    onProbeUpdate: vi.fn(),
    listSpawnNotifications: vi.fn(),
    dispatchSpawnNotification: vi.fn(),
    onSpawnNotificationsWake: vi.fn(),
  },
}));

vi.mock("@renderer/api/workspace/workspace", () => ({
  workspaceApi: {
    list: vi.fn(),
    getById: vi.fn(),
    getDefaultPath: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    openFolder: vi.fn(),
  },
}));

const mockRegistry: AcpRegistry = {
  version: "1",
  agents: [
    {
      id: "claude-code",
      name: "Claude Code",
      version: "1.2.3",
      description: "ACP agent",
      authors: ["Anthropic"],
      license: "MIT",
      distribution: {
        npx: {
          package: "@anthropic/claude-code",
        },
      },
    },
  ],
};

const mockStatuses: Record<string, AcpAgentStatus> = {
  "claude-code": {
    id: "claude-code",
    installed: true,
    detectedVersion: "1.2.3",
    managedBy: "fyllocode",
    updateAvailable: false,
    latestVersion: "1.2.3",
  },
};

let expectedConsoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

function spyOnExpectedConsoleError(): ReturnType<typeof vi.spyOn> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expectedConsoleErrorSpy = spy;
  return spy;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function textParts(text: string): [{ type: "text"; text: string }] {
  return [{ type: "text", text }];
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "project-1",
    agentId: "claude-code",
    sessionMode: "fyllocode",
    title: "Session",
    isPinned: false,
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date("2026-04-30T08:00:00.000Z"),
    updatedAt: new Date("2026-04-30T08:00:00.000Z"),
    messages: [],
    ...overrides,
  };
}

function makeSpawnNotification(
  overrides: Partial<SpawnNotificationSummary> = {}
): SpawnNotificationSummary {
  return {
    notificationId: "notification-1",
    parentSessionId: "parent-1",
    spawnedSessionId: "spawn-1",
    turnId: "turn-1",
    status: "completed",
    responseId: "response-1",
    ...overrides,
  };
}

function prepareDraftConversation(): void {
  const acpAgentsStore = useAcpAgentsStore();
  acpAgentsStore.registry = mockRegistry;
  acpAgentsStore.statuses = mockStatuses;

  const workspaceStore = useWorkspaceStore();
  workspaceStore.currentWorkspace = workspaceInfo({
    id: "project-1",
    name: "Project 1",
    folderPath: "/tmp/project-1",
    createdAt: new Date("2026-04-30T08:00:00.000Z"),
    lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
  });

  useSessionStore().beginDraftSession();
}

describe("useChatStore", () => {
  afterEach(() => {
    expectedConsoleErrorSpy?.mockRestore();
    expectedConsoleErrorSpy = null;
    vi.useRealTimers();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    vi.mocked(workspaceApi.list).mockResolvedValue({
      ok: true,
      data: [],
    });
    vi.mocked(chatApi.createSession).mockResolvedValue({
      ok: true,
      data: {
        id: "session-1",
        workspaceId: "project-1",
        agentId: "claude-code",
        sessionMode: "fyllocode",
        title: "hello world",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        updatedAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        messages: [],
      },
    });
    vi.mocked(chatApi.persistMessage).mockResolvedValue({
      ok: true,
      data: undefined,
    });
    vi.mocked(chatApi.removeSession).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(chatApi.streamMessage).mockReturnValue(() => {});
    vi.mocked(chatApi.onProbeUpdate).mockReturnValue(vi.fn());
    vi.mocked(chatApi.listSpawnNotifications).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(chatApi.dispatchSpawnNotification).mockReturnValue(vi.fn());
    vi.mocked(chatApi.onSpawnNotificationsWake).mockReturnValue(vi.fn());
    vi.mocked(chatApi.loadMessages).mockResolvedValue({ ok: true, data: [] });
  });

  it("按 parent sessionId 流式派发通知并在终态刷新非 active Session，不切换当前会话", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-1" });
    const sessionStore = useSessionStore();
    const parent = makeSession({
      id: "parent-1",
      title: "Parent",
      messages: [
        {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          metadata: { sessionId: "parent-1", createdAt: new Date() },
        },
      ],
    });
    const active = makeSession({ id: "active-1", title: "Active" });
    sessionStore.sessions = [parent, active];
    sessionStore.activeSessionId = "active-1";
    // 终态回调会接力 drain，首次之后的 list 必须返回空，避免重复 dispatch。
    vi.mocked(chatApi.listSpawnNotifications).mockResolvedValueOnce({
      ok: true,
      data: [makeSpawnNotification()],
    });
    let notifyCallbacks!: SpawnNotificationStreamCallbacks;
    vi.mocked(chatApi.dispatchSpawnNotification).mockImplementation(
      (_workspaceId, _notificationId, _parentSessionId, callbacks) => {
        notifyCallbacks = callbacks;
        return vi.fn();
      }
    );

    const drain = useChatStore().requestSpawnNotificationDrain("project-1");
    await vi.waitFor(() => expect(chatApi.dispatchSpawnNotification).toHaveBeenCalled());
    expect(chatApi.dispatchSpawnNotification).toHaveBeenCalledWith(
      "project-1",
      "notification-1",
      "parent-1",
      expect.any(Object)
    );

    notifyCallbacks.onAccepted();
    await drain;
    notifyCallbacks.onChunk({ kind: "text_delta", text: "ack" });
    notifyCallbacks.onDone({ totalTokens: 2 });

    // 已加载的非 active Session 在终态后 refresh canonical 消息。
    await vi.waitFor(() =>
      expect(chatApi.loadMessages).toHaveBeenCalledWith("parent-1", "project-1")
    );
    expect(sessionStore.activeSessionId).toBe("active-1");
  });

  it("目标 Session 有用户 turn 时保持 pending，用户 terminal 后再 drain", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-1" });
    const sessionStore = useSessionStore();
    const parent = makeSession({ id: "parent-1" });
    sessionStore.sessions = [parent];
    sessionStore.activeSessionId = "parent-1";
    let callbacks!: StreamCallbacks;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _parts, nextCallbacks) => {
        callbacks = nextCallbacks;
        return vi.fn();
      }
    );
    vi.mocked(chatApi.listSpawnNotifications).mockResolvedValue({
      ok: true,
      data: [
        {
          notificationId: "notification-1",
          parentSessionId: "parent-1",
          spawnedSessionId: "spawn-1",
          turnId: "turn-1",
          status: "error",
          errorCode: "TURN_FAILED",
        },
      ],
    });
    await useChatStore().sendMessage(textParts("user first"));
    await useChatStore().requestSpawnNotificationDrain("project-1");
    expect(chatApi.dispatchSpawnNotification).not.toHaveBeenCalled();

    callbacks.onDone({ totalTokens: 1 });
    await vi.waitFor(() =>
      expect(chatApi.dispatchSpawnNotification).toHaveBeenCalledWith(
        "project-1",
        "notification-1",
        "parent-1",
        expect.any(Object)
      )
    );
  });

  it("notification dispatch 持有目标 arbiter 时拒绝并发用户 prompt", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-1" });
    const sessionStore = useSessionStore();
    sessionStore.sessions = [makeSession({ id: "parent-1" })];
    sessionStore.activeSessionId = "parent-1";
    vi.mocked(chatApi.listSpawnNotifications).mockResolvedValue({
      ok: true,
      data: [makeSpawnNotification()],
    });
    // 不调用 onAccepted/onRejected：本地 intent 持有期间用户 prompt 必须被拒绝。
    let notifyCallbacks!: SpawnNotificationStreamCallbacks;
    vi.mocked(chatApi.dispatchSpawnNotification).mockImplementation(
      (_workspaceId, _notificationId, _parentSessionId, callbacks) => {
        notifyCallbacks = callbacks;
        return vi.fn();
      }
    );

    const drain = useChatStore().requestSpawnNotificationDrain("project-1");
    await vi.waitFor(() => expect(chatApi.dispatchSpawnNotification).toHaveBeenCalled());
    await expect(useChatStore().sendMessage(textParts("racing user"))).resolves.toBe(false);
    expect(chatApi.persistMessage).not.toHaveBeenCalled();
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
    notifyCallbacks.onRejected("not_pending");
    await drain;
  });

  it("active 会话的 notification turn 复用 chatStatus 状态机：submitted → streaming → ready", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-1" });
    const sessionStore = useSessionStore();
    sessionStore.sessions = [makeSession({ id: "parent-1" })];
    sessionStore.activeSessionId = "parent-1";
    vi.mocked(chatApi.listSpawnNotifications).mockResolvedValueOnce({
      ok: true,
      data: [makeSpawnNotification()],
    });
    let notifyCallbacks!: SpawnNotificationStreamCallbacks;
    vi.mocked(chatApi.dispatchSpawnNotification).mockImplementation(
      (_workspaceId, _notificationId, _parentSessionId, callbacks) => {
        notifyCallbacks = callbacks;
        return vi.fn();
      }
    );

    const chatStore = useChatStore();
    const drain = chatStore.requestSpawnNotificationDrain("project-1");
    await vi.waitFor(() => expect(chatApi.dispatchSpawnNotification).toHaveBeenCalled());

    notifyCallbacks.onAccepted();
    await drain;
    expect(chatStore.chatStatus).toBe("submitted");

    notifyCallbacks.onChunk({ kind: "text_delta", text: "ack" });
    expect(chatStore.chatStatus).toBe("streaming");

    notifyCallbacks.onDone({ totalTokens: 2 });
    expect(chatStore.chatStatus).toBe("ready");
  });

  it("busy 拒绝释放本地锁并延迟重试 drain", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-1" });
    const sessionStore = useSessionStore();
    sessionStore.sessions = [makeSession({ id: "parent-1" })];
    sessionStore.activeSessionId = "parent-1";
    vi.mocked(chatApi.listSpawnNotifications).mockResolvedValueOnce({
      ok: true,
      data: [makeSpawnNotification()],
    });
    let notifyCallbacks!: SpawnNotificationStreamCallbacks;
    vi.mocked(chatApi.dispatchSpawnNotification).mockImplementation(
      (_workspaceId, _notificationId, _parentSessionId, callbacks) => {
        notifyCallbacks = callbacks;
        return vi.fn();
      }
    );

    const chatStore = useChatStore();
    const drain = chatStore.requestSpawnNotificationDrain("project-1");
    await vi.waitFor(() => expect(chatApi.dispatchSpawnNotification).toHaveBeenCalledTimes(1));

    // fake timers 必须在 onRejected 之前启用，才能捕获 busy 重试的 setTimeout。
    vi.useFakeTimers();
    notifyCallbacks.onRejected("busy");
    await drain;

    // 本地锁已随 onRejected 释放：用户消息可以立即发出。
    await expect(chatStore.sendMessage(textParts("user next"))).resolves.toBe(true);
    expect(chatApi.persistMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(chatApi.listSpawnNotifications).toHaveBeenCalledTimes(2);
  });

  it("同一父会话的多条通知串行：前一条终态后才 dispatch 下一条", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-1" });
    const sessionStore = useSessionStore();
    sessionStore.sessions = [makeSession({ id: "parent-1" })];
    sessionStore.activeSessionId = "parent-1";
    const second = makeSpawnNotification({
      notificationId: "notification-2",
      spawnedSessionId: "spawn-2",
      turnId: "turn-2",
      responseId: "response-2",
    });
    // 第一次 drain 返回两条；第一条终态后的接力 drain 才返回第二条。
    vi.mocked(chatApi.listSpawnNotifications)
      .mockResolvedValueOnce({ ok: true, data: [makeSpawnNotification(), second] })
      .mockResolvedValueOnce({ ok: true, data: [second] });
    const callbacksById = new Map<string, SpawnNotificationStreamCallbacks>();
    vi.mocked(chatApi.dispatchSpawnNotification).mockImplementation(
      (_workspaceId, notificationId, _parentSessionId, callbacks) => {
        callbacksById.set(notificationId, callbacks);
        return vi.fn();
      }
    );

    const chatStore = useChatStore();
    const drain = chatStore.requestSpawnNotificationDrain("project-1");
    await vi.waitFor(() => expect(callbacksById.has("notification-1")).toBe(true));
    expect(callbacksById.has("notification-2")).toBe(false);

    callbacksById.get("notification-1")!.onAccepted();
    // 第一条持有 stream state 期间，第二条保持 pending、不会被 dispatch。
    await drain;
    expect(callbacksById.has("notification-2")).toBe(false);

    callbacksById.get("notification-1")!.onChunk({ kind: "text_delta", text: "ack" });
    callbacksById.get("notification-1")!.onDone({ totalTokens: 1 });

    // 第一条终态后的接力 drain 重新拉起第二条。
    await vi.waitFor(() => expect(callbacksById.has("notification-2")).toBe(true));
    callbacksById.get("notification-2")!.onAccepted();
    callbacksById.get("notification-2")!.onDone({ totalTokens: 1 });
  });

  it("非当前 Workspace 的 drain 请求不读取也不派发通知", async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({ id: "project-2" });

    await useChatStore().requestSpawnNotificationDrain("project-1");

    expect(chatApi.listSpawnNotifications).not.toHaveBeenCalled();
    expect(chatApi.dispatchSpawnNotification).not.toHaveBeenCalled();
  });

  it("creates a real session lazily when sending the first draft message", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "hello world",
      agentId: "claude-code",
      sessionMode: "fyllocode",
    });
    expect(sessionStore.activeSessionId).toBe("session-1");
    expect(sessionStore.sessions).toHaveLength(1);
    expect(sessionStore.sessions[0]?.isPinned).toBe(false);
    expect(sessionStore.sessions[0]?.turnCount).toBe(1);
    expect(sessionStore.sessions[0]?.messages).toHaveLength(1);
    expect(sessionStore.sessions[0]?.messages[0]?.metadata?.sessionId).toBe("session-1");
    expect(chatApi.persistMessage).toHaveBeenCalledTimes(1);
    expect(chatApi.persistMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      expect.objectContaining({
        role: "user",
        metadata: expect.objectContaining({
          sessionId: "session-1",
        }),
      })
    );
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "hello world" }],
      expect.any(Object),
      expect.objectContaining({ userMessageId: expect.any(String) })
    );
    expect(chatStore.streamError).toBeNull();
    expect(chatStore.chatStatus).toBe("submitted");
  });

  it("persists native mode when sending the first draft message", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.setDraftSessionMode("native");
    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: makeSession({ sessionMode: "native" }),
    });

    await useChatStore().sendMessage(textParts("native prompt"));

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "native prompt",
      agentId: "claude-code",
      sessionMode: "native",
    });
    expect(sessionStore.activeSession?.sessionMode).toBe("native");
  });

  it("promotes a matching native draft probe into the first Session", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.setDraftSessionMode("native");
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "native",
      status: "ready",
      fylloSessionId: "native-session",
      acpSessionId: "native-acp",
      configOptions: [],
      availableCommands: [],
    });
    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: makeSession({ sessionMode: "native" }),
    });

    await useChatStore().sendMessage(textParts("use native probe"));

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "use native probe",
      agentId: "claude-code",
      sessionMode: "native",
      configOptions: [],
      availableCommands: [],
      acpSessionId: "native-acp",
      fylloSessionId: "native-session",
    });
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "use native probe" }],
      expect.any(Object),
      expect.objectContaining({
        acpSessionId: "native-acp",
        userMessageId: expect.any(String),
      })
    );
    expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(false);
  });

  it("discards a late draft creation when the mode changes during submission", async () => {
    prepareDraftConversation();
    const createRequest = deferred<{ ok: true; data: Session }>();
    vi.mocked(chatApi.createSession).mockReturnValueOnce(createRequest.promise);

    const sending = useChatStore().sendMessage(textParts("mode can change"));
    useSessionStore().setDraftSessionMode("native");
    createRequest.resolve({
      ok: true,
      data: makeSession({ id: "session-late", sessionMode: "fyllocode" }),
    });

    await expect(sending).resolves.toBe(false);
    expect(chatApi.removeSession).toHaveBeenCalledWith("session-late", "project-1");
    expect(useSessionStore().activeSessionId).toBeNull();
    expect(useSessionStore().draftSessionMode).toBe("native");
    expect(chatApi.persistMessage).not.toHaveBeenCalled();
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
  });

  it("rejects attachment-only and system-reminder-only store submissions", async () => {
    prepareDraftConversation();
    const chatStore = useChatStore();

    await expect(
      chatStore.sendMessage([
        {
          type: "attachment",
          attachmentId: "11111111-1111-4111-8111-111111111111",
          mediaType: "image/png",
          filename: "diagram.png",
        },
      ])
    ).resolves.toBe(false);
    await expect(
      chatStore.sendMessage([{ type: "text", text: "<system-reminder>internal</system-reminder>" }])
    ).resolves.toBe(false);

    expect(chatApi.createSession).not.toHaveBeenCalled();
    expect(chatApi.persistMessage).not.toHaveBeenCalled();
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
  });

  it("materializes ready-probe attachments into one invisible session before activation", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-probe",
      configOptions: [],
      availableCommands: [],
    });
    const createRequest = deferred<{ ok: true; data: Session }>();
    const persistRequest = deferred<{ ok: true; data: undefined }>();
    vi.mocked(chatApi.createSession).mockReturnValueOnce(createRequest.promise);
    vi.mocked(chatApi.persistMessage).mockReturnValueOnce(persistRequest.promise);
    const materializeAttachments = vi.fn().mockResolvedValue([
      {
        type: "attachment",
        attachmentId: "11111111-1111-4111-8111-111111111111",
        mediaType: "image/png",
        filename: "diagram.png",
      },
      {
        type: "attachment",
        attachmentId: "22222222-2222-4222-8222-222222222222",
        mediaType: "text/markdown",
        filename: "notes.md",
      },
    ]);

    const sending = useChatStore().sendMessage(
      [{ type: "text", text: "  review\nthese files  " }],
      { materializeAttachments }
    );
    expect(sessionStore.sessions).toEqual([]);
    expect(sessionStore.activeSessionId).toBeNull();

    createRequest.resolve({
      ok: true,
      data: makeSession({ id: "session-probe", title: "review these files" }),
    });
    await vi.waitFor(() => {
      expect(materializeAttachments).toHaveBeenCalledWith({
        workspaceId: "project-1",
        sessionId: "session-probe",
      });
      expect(chatApi.persistMessage).toHaveBeenCalledTimes(1);
    });
    expect(sessionStore.sessions).toEqual([]);
    expect(sessionStore.activeSessionId).toBeNull();
    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "review these files",
      agentId: "claude-code",
      sessionMode: "fyllocode",
      configOptions: [],
      availableCommands: [],
      acpSessionId: "acp-probe",
      fylloSessionId: "session-probe",
    });
    expect(chatApi.persistMessage).toHaveBeenCalledWith(
      "session-probe",
      "project-1",
      expect.objectContaining({
        parts: [
          { type: "text", text: "  review\nthese files  " },
          expect.objectContaining({ attachmentId: "11111111-1111-4111-8111-111111111111" }),
          expect.objectContaining({ attachmentId: "22222222-2222-4222-8222-222222222222" }),
        ],
      })
    );

    persistRequest.resolve({ ok: true, data: undefined });
    await expect(sending).resolves.toBe(true);
    expect(sessionStore.activeSessionId).toBe("session-probe");
    expect(sessionStore.sessions).toHaveLength(1);
    expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(false);
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-probe",
      "project-1",
      "claude-code",
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({ attachmentId: "11111111-1111-4111-8111-111111111111" }),
        expect.objectContaining({ attachmentId: "22222222-2222-4222-8222-222222222222" }),
      ]),
      expect.any(Object),
      expect.objectContaining({
        acpSessionId: "acp-probe",
        userMessageId: expect.any(String),
      })
    );
  });

  it("rolls back an uncommitted ready-probe session when attachment materialization fails", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-probe",
      configOptions: [],
      availableCommands: [],
    });
    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: makeSession({ id: "session-probe", title: "upload files" }),
    });

    const sent = await useChatStore().sendMessage([{ type: "text", text: "upload files" }], {
      materializeAttachments: vi.fn().mockRejectedValue(new Error("second attachment failed")),
    });

    expect(sent).toBe(false);
    expect(chatApi.removeSession).toHaveBeenCalledWith("session-probe", "project-1");
    expect(sessionStore.sessions).toEqual([]);
    expect(sessionStore.activeSessionId).toBeNull();
    expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(true);
    expect(chatApi.persistMessage).not.toHaveBeenCalled();
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
  });

  it("rolls back when the first durable message append fails", async () => {
    prepareDraftConversation();
    vi.mocked(chatApi.persistMessage).mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "write failed" },
    });

    const sent = await useChatStore().sendMessage([{ type: "text", text: "hello" }]);

    expect(sent).toBe(false);
    expect(chatApi.removeSession).toHaveBeenCalledWith("session-1", "project-1");
    expect(useSessionStore().activeSessionId).toBeNull();
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
  });

  it("discards a late draft creation after the Workspace scope changes", async () => {
    prepareDraftConversation();
    const createRequest = deferred<{ ok: true; data: Session }>();
    vi.mocked(chatApi.createSession).mockReturnValueOnce(createRequest.promise);
    const sending = useChatStore().sendMessage(textParts("hello"));

    useWorkspaceStore().currentWorkspace = workspaceInfo({ id: "project-2" });
    createRequest.resolve({ ok: true, data: makeSession({ id: "session-late" }) });

    await expect(sending).resolves.toBe(false);
    expect(chatApi.removeSession).toHaveBeenCalledWith("session-late", "project-1");
    expect(useSessionStore().activeSessionId).toBeNull();
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
  });

  it("tracks a session-local indicator from the first assistant chunk until stream completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T08:00:00.000Z"));
    prepareDraftConversation();

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello"));

    expect(chatStore.activeStreamIndicator).toBeNull();

    callbacks!.onChunk({ kind: "text_delta", text: "answer" });
    const firstIndicator = chatStore.activeStreamIndicator;
    expect(firstIndicator).toMatchObject({ startedAt: Date.now() });
    expect(firstIndicator?.messageId).toBe(useSessionStore().activeSession?.messages.at(-1)?.id);

    vi.advanceTimersByTime(1000);
    callbacks!.onChunk({ kind: "reasoning_delta", text: "more" });
    expect(chatStore.activeStreamIndicator).toEqual(firstIndicator);

    callbacks!.onDone({ totalTokens: 1 });
    expect(chatStore.activeStreamIndicator).toBeNull();
  });

  it("keeps concurrently streaming session indicators isolated across session switches", async () => {
    prepareDraftConversation();
    vi.mocked(chatApi.loadMessages).mockResolvedValue({ ok: true, data: [] });
    const sessionStore = useSessionStore();
    sessionStore.sessions = [makeSession({ id: "session-a" }), makeSession({ id: "session-b" })];
    sessionStore.activeSessionId = "session-a";

    const callbacksBySession = new Map<string, StreamCallbacks>();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (sessionId, _workspaceId, _agentId, _prompt, callbacks) => {
        callbacksBySession.set(sessionId, callbacks);
        return () => {};
      }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("run A"));
    callbacksBySession.get("session-a")!.onChunk({ kind: "text_delta", text: "A" });
    const indicatorA = chatStore.activeStreamIndicator;

    await sessionStore.selectSession("session-b");
    await chatStore.sendMessage(textParts("run B"));
    callbacksBySession.get("session-b")!.onChunk({ kind: "text_delta", text: "B" });
    const indicatorB = chatStore.activeStreamIndicator;

    expect(indicatorA).not.toBeNull();
    expect(indicatorB).not.toBeNull();
    expect(indicatorB?.messageId).not.toBe(indicatorA?.messageId);

    await sessionStore.selectSession("session-a");
    expect(chatStore.activeStreamIndicator).toEqual(indicatorA);

    callbacksBySession.get("session-b")!.onDone({ totalTokens: 1 });
    expect(chatStore.activeStreamIndicator).toEqual(indicatorA);
  });

  it("removes the active indicator after an error or cancellation", async () => {
    const consoleError = spyOnExpectedConsoleError();
    prepareDraftConversation();
    const callbacks: StreamCallbacks[] = [];
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks.push(nextCallbacks);
        return () => {};
      }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("first"));
    callbacks[0]!.onChunk({ kind: "text_delta", text: "first answer" });
    expect(chatStore.activeStreamIndicator).not.toBeNull();

    callbacks[0]!.onError({ code: "stream_failed", message: "disconnected" });
    expect(chatStore.activeStreamIndicator).toBeNull();

    await chatStore.sendMessage(textParts("second"));
    callbacks[1]!.onChunk({ kind: "text_delta", text: "second answer" });
    expect(chatStore.activeStreamIndicator).not.toBeNull();

    chatStore.cancelStream();
    expect(chatStore.activeStreamIndicator).toBeNull();
    expect(consoleError).toHaveBeenCalledWith("Stream error:", "stream_failed", "disconnected");
  });

  it("cancels the first draft send while session creation is still pending", async () => {
    prepareDraftConversation();

    const createDeferred = deferred<Awaited<ReturnType<typeof chatApi.createSession>>>();
    vi.mocked(chatApi.createSession).mockReturnValueOnce(createDeferred.promise);

    const chatStore = useChatStore();
    const sendPromise = chatStore.sendMessage(textParts("hello world"));

    expect(chatStore.chatStatus).toBe("submitted");

    chatStore.cancelStream();

    expect(chatStore.chatStatus).toBe("ready");
    expect(chatStore.cancelFn).toBeNull();
    expect(chatStore.streamError).toBeNull();

    createDeferred.resolve({
      ok: true,
      data: {
        id: "session-setup",
        workspaceId: "project-1",
        agentId: "claude-code",
        sessionMode: "fyllocode",
        title: "hello world",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        updatedAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        messages: [],
      },
    });
    await sendPromise;

    const sessionStore = useSessionStore();
    expect(chatStore.chatStatus).toBe("ready");
    expect(chatApi.streamMessage).not.toHaveBeenCalled();
    expect(chatApi.persistMessage).not.toHaveBeenCalled();
    expect(sessionStore.activeSession).toBeNull();
    expect(sessionStore.sessions).toHaveLength(0);
    expect(chatApi.removeSession).toHaveBeenCalledWith("session-setup", "project-1");
  });

  it("ignores a late stream error after cancelling before the first chunk", async () => {
    prepareDraftConversation();

    let callbacks: StreamCallbacks | null = null;
    const cancel = vi.fn();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return cancel;
      }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    expect(chatStore.chatStatus).toBe("submitted");
    expect(callbacks).not.toBeNull();

    chatStore.cancelStream();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(chatStore.chatStatus).toBe("ready");
    expect(chatStore.cancelFn).toBeNull();
    expect(chatStore.streamError).toBeNull();

    callbacks!.onError({
      code: "stream_failed",
      message: "late failure",
    });

    expect(chatStore.chatStatus).toBe("ready");
    expect(chatStore.streamError).toBeNull();
  });

  it("updates the active session message list reactively for the first draft message", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const observedMessageCounts: number[] = [];
    const stop = watch(
      () => sessionStore.activeSession?.messages.length ?? 0,
      (count) => {
        observedMessageCounts.push(count);
      },
      { immediate: true, flush: "sync" }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));
    stop();

    expect(observedMessageCounts).toContain(1);
    expect(observedMessageCounts.at(-1)).toBe(1);
  });

  it("passes ready draft probe acpSessionId and clears it before streaming", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    const probeConfigOptions = [
      {
        type: "select" as const,
        id: "model",
        name: "Model",
        currentValue: "haiku",
        options: [{ value: "haiku", name: "Haiku" }],
      },
    ];
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-probe",
      configOptions: probeConfigOptions,
      availableCommands: [{ name: "init", description: "Initialize" }],
    });
    const applyProbeUpdateSpy = vi.spyOn(sessionStore, "applyProbeUpdate");
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, _callbacks, options) => {
        expect(applyProbeUpdateSpy).toHaveBeenCalledWith("claude-code", null);
        expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(false);
        expect(options).toEqual({ acpSessionId: "acp-probe" });
        return () => {};
      }
    );

    await useChatStore().sendMessage(textParts("hello world"));

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "hello world",
      agentId: "claude-code",
      sessionMode: "fyllocode",
      configOptions: probeConfigOptions,
      availableCommands: [{ name: "init", description: "Initialize" }],
      acpSessionId: "acp-probe",
      fylloSessionId: "session-probe",
    });
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "hello world" }],
      expect.any(Object),
      expect.objectContaining({
        acpSessionId: "acp-probe",
        userMessageId: expect.any(String),
      })
    );
  });

  it("does not pass acpSessionId when draft probe failed", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "failed",
      fylloSessionId: "session-probe",
      acpSessionId: null,
      configOptions: [],
      availableCommands: [],
      error: { code: "ACP_ERROR", message: "failed" },
    });
    const applyProbeUpdateSpy = vi.spyOn(sessionStore, "applyProbeUpdate");

    await useChatStore().sendMessage(textParts("hello world"));

    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "hello world" }],
      expect.any(Object),
      expect.objectContaining({ userMessageId: expect.any(String) })
    );
    expect(applyProbeUpdateSpy).not.toHaveBeenCalledWith("claude-code", null);
  });

  it("does not read draftProbe when sending in an established session", async () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      {
        id: "session-1",
        workspaceId: "project-1",
        agentId: "claude-code",
        sessionMode: "fyllocode",
        title: "Session",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      },
    ];
    sessionStore.activeSessionId = "session-1";
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      sessionMode: "fyllocode",
      status: "ready",
      fylloSessionId: "session-probe",
      acpSessionId: "acp-probe",
      configOptions: [],
      availableCommands: [],
    });
    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    });

    await useChatStore().sendMessage(textParts("hello again"));

    expect(chatApi.createSession).not.toHaveBeenCalled();
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "hello again" }],
      expect.any(Object),
      expect.objectContaining({ userMessageId: expect.any(String) })
    );
    expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(true);
  });

  it("uses a normalized truncated first message as fallback session title", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "session-2",
        workspaceId: "project-1",
        agentId: "claude-code",
        sessionMode: "fyllocode",
        title: "hello world this message is in",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        updatedAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        messages: [],
      },
    });

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(
      textParts("  hello\n\nworld   this message is intentionally long  ")
    );

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "hello world this message is in",
      agentId: "claude-code",
      sessionMode: "fyllocode",
    });
    expect(sessionStore.activeSession?.title).toBe("hello world this message is in");
  });

  it("skips system-reminder text part when building fallback session title", async () => {
    prepareDraftConversation();

    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "session-2",
        workspaceId: "project-1",
        agentId: "claude-code",
        sessionMode: "fyllocode",
        title: "hello world this message is in",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        updatedAt: "2026-04-30T09:00:00.000Z" as unknown as Date,
        messages: [],
      },
    });

    const chatStore = useChatStore();
    await chatStore.sendMessage([
      { type: "text", text: "<system-reminder>\nhealth check\n</system-reminder>" },
      {
        type: "text",
        text: "  hello\n\nworld   this message is intentionally long  ",
      },
    ]);

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "hello world this message is in",
      agentId: "claude-code",
      sessionMode: "fyllocode",
    });
    expect(useSessionStore().activeSession?.title).toBe("hello world this message is in");
  });

  it("rejects system-reminder-only content without creating a default Session", async () => {
    prepareDraftConversation();

    const chatStore = useChatStore();
    const sent = await chatStore.sendMessage([
      { type: "text", text: "<system-reminder>\nonly reminder\n</system-reminder>" },
    ]);

    expect(sent).toBe(false);
    expect(chatApi.createSession).not.toHaveBeenCalled();
    expect(useSessionStore().activeSession).toBeNull();
  });

  it("extracts **标题** from the first non-reminder text part", async () => {
    prepareDraftConversation();

    const chatStore = useChatStore();
    await chatStore.sendMessage([
      { type: "text", text: "<system-reminder>\nirrelevant\n</system-reminder>" },
      { type: "text", text: "**标题**: 修复解析器内存泄漏\n\n更多说明" },
    ]);

    expect(chatApi.createSession).toHaveBeenCalledWith({
      workspaceId: "project-1",
      title: "修复解析器内存泄漏",
      agentId: "claude-code",
      sessionMode: "fyllocode",
    });
  });

  it("allows session_info_update to override the fallback title", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    expect(sessionStore.activeSession?.title).toBe("hello world");
    expect(callbacks).not.toBeNull();
    callbacks!.onChunk({ kind: "session_info_update", title: "Agent Generated Title" });
    expect(sessionStore.activeSession?.title).toBe("Agent Generated Title");
  });

  it("updates active session token usage from usage_update chunks", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    callbacks!.onChunk({
      kind: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    });

    expect(sessionStore.activeSession?.tokenUsage).toEqual({
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    });
  });

  it("does not persist assistant messages from onDone", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    expect(chatApi.persistMessage).toHaveBeenCalledTimes(1);
    callbacks!.onChunk({ kind: "text_delta", text: "assistant reply" });
    callbacks!.onDone({ totalTokens: 3 });

    expect(sessionStore.activeSession?.messages).toHaveLength(2);
    expect(sessionStore.activeSession?.messages[1]?.role).toBe("assistant");
    expect(chatApi.persistMessage).toHaveBeenCalledTimes(1);
    expect(chatStore.chatStatus).toBe("ready");
    expect(chatStore.streamError).toBeNull();
    expect(chatStore.cancelFn).toBeNull();
  });

  it("routes available_commands_update to the session store without touching the assembler path", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    const setSessionAvailableCommandsSpy = vi.spyOn(sessionStore, "setSessionAvailableCommands");
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    callbacks!.onChunk({
      kind: "available_commands_update",
      commands: [{ name: "review", description: "Review code", hint: "path" }],
    });

    expect(setSessionAvailableCommandsSpy).toHaveBeenCalledWith("session-1", [
      { name: "review", description: "Review code", hint: "path" },
    ]);
    expect(sessionStore.activeSession?.messages).toHaveLength(1);
  });

  it("routes agenda_update to the session store without touching the assembler path", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    const setSessionAgentAgendaSpy = vi.spyOn(sessionStore, "setSessionAgentAgenda");
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    callbacks!.onChunk({
      kind: "agenda_update",
      entries: [{ content: "分析代码", priority: "high", status: "in_progress" }],
    });

    expect(setSessionAgentAgendaSpy).toHaveBeenCalledWith("session-1", [
      { content: "分析代码", priority: "high", status: "in_progress" },
    ]);
    expect(sessionStore.activeSession?.messages).toHaveLength(1);
  });

  it("routes reasoning_delta through the default assembler path", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    callbacks!.onChunk({ kind: "reasoning_delta", text: "thinking" });

    expect(sessionStore.activeSession?.messages).toHaveLength(2);
    expect(sessionStore.activeSession?.messages[1]?.parts).toEqual([
      { type: "reasoning", text: "thinking", state: "streaming" },
    ]);
    expect(chatStore.chatStatus).toBe("streaming");
  });

  it("stores stream errors in chat state and clears active stream control", async () => {
    const consoleError = spyOnExpectedConsoleError();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    const cancel = vi.fn();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return cancel;
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    expect(chatStore.cancelFn).toBe(cancel);

    callbacks!.onError({
      code: "stream_failed",
      message: "The stream disconnected unexpectedly",
    });

    expect(chatStore.streamError).toEqual({
      code: "stream_failed",
      message: "The stream disconnected unexpectedly",
    });
    expect(chatStore.chatStatus).toBe("error");
    expect(chatStore.cancelFn).toBeNull();
    expect(sessionStore.activeSession?.status).toBe("ended");
    expect(consoleError).toHaveBeenCalledWith(
      "Stream error:",
      "stream_failed",
      "The stream disconnected unexpectedly"
    );
  });

  it("keeps receiving background session chunks after switching sessions", async () => {
    prepareDraftConversation();
    const workspaceStore = useWorkspaceStore();
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      makeSession({
        id: "session-a",
        title: "Session A",
        messages: [
          {
            id: "existing-a",
            role: "user",
            parts: [{ type: "text", text: "existing A" }],
            metadata: { sessionId: "session-a", createdAt: new Date() },
          },
        ],
      }),
      makeSession({
        id: "session-b",
        title: "Session B",
        messages: [
          {
            id: "existing-b",
            role: "user",
            parts: [{ type: "text", text: "existing B" }],
            metadata: { sessionId: "session-b", createdAt: new Date() },
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-a";

    const callbacksBySession = new Map<string, StreamCallbacks>();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (sessionId, _workspaceId, _agentId, _prompt, callbacks) => {
        callbacksBySession.set(sessionId, callbacks);
        return () => {};
      }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("run A"));
    expect(chatStore.chatStatus).toBe("submitted");

    await sessionStore.selectSession("session-b");
    expect(chatStore.chatStatus).toBe("ready");

    callbacksBySession.get("session-a")!.onChunk({ kind: "text_delta", text: "background A" });

    const sessionA = sessionStore.sessions.find((session) => session.id === "session-a")!;
    const sessionB = sessionStore.sessions.find((session) => session.id === "session-b")!;
    expect(sessionA.messages.at(-1)).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "background A" }],
    });
    expect(sessionB.messages).toHaveLength(1);
    expect(chatStore.chatStatus).toBe("ready");
    expect(workspaceStore.currentWorkspace?.id).toBe("project-1");
  });

  it("keeps background completion in memory when switching back to the session", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      makeSession({
        id: "session-a",
        title: "Session A",
        tokenUsage: { used: 10, size: 100 },
        messages: [
          {
            id: "existing-a",
            role: "user",
            parts: [{ type: "text", text: "existing A" }],
            metadata: { sessionId: "session-a", createdAt: new Date() },
          },
        ],
      }),
      makeSession({
        id: "session-b",
        title: "Session B",
        messages: [
          {
            id: "existing-b",
            role: "user",
            parts: [{ type: "text", text: "existing B" }],
            metadata: { sessionId: "session-b", createdAt: new Date() },
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-a";

    const callbacksBySession = new Map<string, StreamCallbacks>();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (sessionId, _workspaceId, _agentId, _prompt, callbacks) => {
        callbacksBySession.set(sessionId, callbacks);
        return () => {};
      }
    );

    await useChatStore().sendMessage(textParts("run A"));
    await sessionStore.selectSession("session-b");

    callbacksBySession.get("session-a")!.onChunk({ kind: "text_delta", text: "done A" });
    callbacksBySession.get("session-a")!.onDone({ totalTokens: 7 });

    const sessionA = sessionStore.sessions.find((session) => session.id === "session-a")!;
    expect(sessionA.status).toBe("ended");
    expect(sessionA.tokenUsage.used).toBe(17);

    await sessionStore.selectSession("session-a");

    expect(sessionStore.activeSession?.messages.at(-1)).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "done A" }],
    });
    expect(useChatStore().chatStatus).toBe("ready");
  });

  it("stops only the current session while another session continues streaming", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      makeSession({
        id: "session-a",
        messages: [
          {
            id: "existing-a",
            role: "user",
            parts: [{ type: "text", text: "existing A" }],
            metadata: { sessionId: "session-a", createdAt: new Date() },
          },
        ],
      }),
      makeSession({
        id: "session-b",
        messages: [
          {
            id: "existing-b",
            role: "user",
            parts: [{ type: "text", text: "existing B" }],
            metadata: { sessionId: "session-b", createdAt: new Date() },
          },
        ],
      }),
    ];
    sessionStore.activeSessionId = "session-a";

    const callbacksBySession = new Map<string, StreamCallbacks>();
    const cancelBySession = new Map<string, ReturnType<typeof vi.fn>>();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (sessionId, _workspaceId, _agentId, _prompt, callbacks) => {
        callbacksBySession.set(sessionId, callbacks);
        const cancel = vi.fn();
        cancelBySession.set(sessionId, cancel);
        return cancel;
      }
    );

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("run A"));
    await sessionStore.selectSession("session-b");
    await chatStore.sendMessage(textParts("run B"));

    chatStore.cancelStream();

    expect(cancelBySession.get("session-b")).toHaveBeenCalledTimes(1);
    expect(cancelBySession.get("session-a")).not.toHaveBeenCalled();
    expect(chatStore.chatStatus).toBe("ready");

    callbacksBySession.get("session-b")!.onChunk({ kind: "text_delta", text: "late B" });
    callbacksBySession.get("session-a")!.onChunk({ kind: "text_delta", text: "still A" });

    const sessionA = sessionStore.sessions.find((session) => session.id === "session-a")!;
    const sessionB = sessionStore.sessions.find((session) => session.id === "session-b")!;
    expect(sessionA.messages.at(-1)).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "still A" }],
    });
    expect(sessionB.messages.some((message) => message.role === "assistant")).toBe(false);
  });

  it("resetChatState only resets chat transient state", async () => {
    const consoleError = spyOnExpectedConsoleError();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));
    callbacks!.onError({ code: "stream_failed", message: "bad network" });

    const sessionSnapshot = JSON.stringify({
      sessions: sessionStore.sessions,
      activeSessionId: sessionStore.activeSessionId,
    });

    chatStore.resetChatState();

    expect(chatStore.chatStatus).toBe("ready");
    expect(chatStore.streamError).toBeNull();
    expect(chatStore.cancelFn).toBeNull();
    expect(
      JSON.stringify({
        sessions: sessionStore.sessions,
        activeSessionId: sessionStore.activeSessionId,
      })
    ).toBe(sessionSnapshot);
    expect(consoleError).toHaveBeenCalledWith("Stream error:", "stream_failed", "bad network");
  });

  it("clears the previous error before starting a new send after failure", async () => {
    const consoleError = spyOnExpectedConsoleError();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    const streamCallbacks: StreamCallbacks[] = [];
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        streamCallbacks.push(nextCallbacks);
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));
    streamCallbacks[0]!.onError({ code: "stream_failed", message: "bad network" });

    expect(chatStore.chatStatus).toBe("error");
    expect(chatStore.streamError).toEqual({ code: "stream_failed", message: "bad network" });

    await chatStore.sendMessage(textParts("retry request"));

    expect(chatStore.streamError).toBeNull();
    expect(chatStore.chatStatus).toBe("submitted");
    expect(sessionStore.activeSession?.messages.at(-1)?.role).toBe("user");
    expect(sessionStore.activeSession?.turnCount).toBe(2);
    expect(consoleError).toHaveBeenCalledWith("Stream error:", "stream_failed", "bad network");
  });

  it("returns from error to ready when a later stream run completes", async () => {
    const consoleError = spyOnExpectedConsoleError();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = workspaceInfo({
      id: "project-1",
      name: "Project 1",
      folderPath: "/tmp/project-1",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    });

    const streamCallbacks: StreamCallbacks[] = [];
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
        streamCallbacks.push(nextCallbacks);
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));
    streamCallbacks[0]!.onError({ code: "stream_failed", message: "bad network" });

    await chatStore.sendMessage(textParts("retry request"));
    streamCallbacks[1]!.onChunk({ kind: "text_delta", text: "assistant reply" });
    streamCallbacks[1]!.onDone({ totalTokens: 5 });

    expect(chatStore.chatStatus).toBe("ready");
    expect(chatStore.streamError).toBeNull();
    expect(chatStore.cancelFn).toBeNull();
    expect(sessionStore.activeSession?.messages.at(-1)?.role).toBe("assistant");
    expect(consoleError).toHaveBeenCalledWith("Stream error:", "stream_failed", "bad network");
  });

  describe("config options", () => {
    function withSession(): {
      sessionStore: ReturnType<typeof useSessionStore>;
      chatStore: ReturnType<typeof useChatStore>;
    } {
      const acpAgentsStore = useAcpAgentsStore();
      acpAgentsStore.registry = mockRegistry;
      acpAgentsStore.statuses = mockStatuses;

      const workspaceStore = useWorkspaceStore();
      workspaceStore.currentWorkspace = workspaceInfo({
        id: "project-1",
        name: "Project 1",
        folderPath: "/tmp/project-1",
        createdAt: new Date("2026-04-30T08:00:00.000Z"),
        lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
      });

      const sessionStore = useSessionStore();
      sessionStore.sessions = [
        {
          id: "session-1",
          workspaceId: "project-1",
          agentId: "claude-code",
          sessionMode: "fyllocode",
          title: "Session",
          isPinned: false,
          status: "running",
          turnCount: 1,
          tokenUsage: { used: 0, size: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
          configOptions: [
            {
              type: "select",
              id: "model",
              name: "Model",
              currentValue: "sonnet",
              options: [
                { value: "sonnet", name: "Sonnet" },
                { value: "haiku", name: "Haiku" },
              ],
            },
          ],
        },
      ];
      sessionStore.activeSessionId = "session-1";

      const chatStore = useChatStore();
      return { sessionStore, chatStore };
    }

    it("routes config_options_update chunks to setSessionConfigOptions", async () => {
      const { sessionStore } = withSession();
      let callbacks: StreamCallbacks | null = null;
      vi.mocked(chatApi.streamMessage).mockImplementation(
        (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
          callbacks = nextCallbacks;
          return () => {};
        }
      );
      const setSpy = vi.spyOn(sessionStore, "setSessionConfigOptions");

      const chatStore = useChatStore();
      await chatStore.sendMessage(textParts("hello"));

      callbacks!.onChunk({
        kind: "config_options_update",
        options: [
          {
            type: "select",
            id: "model",
            name: "Model",
            currentValue: "haiku",
            options: [{ value: "haiku", name: "Haiku" }],
          },
        ],
      });

      expect(setSpy).toHaveBeenCalledWith(
        sessionStore.activeSession!.id,
        expect.arrayContaining([expect.objectContaining({ id: "model", currentValue: "haiku" })])
      );
    });

    it("optimistically updates currentValue and replaces full set on success", async () => {
      const { sessionStore, chatStore } = withSession();
      vi.mocked(chatApi.setConfigOption).mockResolvedValue({
        ok: true,
        data: {
          configOptions: [
            {
              type: "select",
              id: "model",
              name: "Model",
              currentValue: "haiku",
              options: [
                { value: "sonnet", name: "Sonnet" },
                { value: "haiku", name: "Haiku" },
              ],
            },
          ],
        },
      });

      const promise = chatStore.setConfigOption({
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      });

      expect(chatStore.pendingConfigIds.has("model")).toBe(true);
      const optimistic = sessionStore.sessions[0]!.configOptions![0];
      expect(optimistic.currentValue).toBe("haiku");

      await promise;
      expect(chatStore.pendingConfigIds.has("model")).toBe(false);
      expect(sessionStore.sessions[0]!.configOptions![0]!.currentValue).toBe("haiku");
    });

    it("rolls back currentValue and clears pending when IPC fails", async () => {
      const { sessionStore, chatStore } = withSession();
      vi.mocked(chatApi.setConfigOption).mockResolvedValue({
        ok: false,
        error: { code: "CONFIG_OPTION_INVALID_VALUE", message: "bad" },
      });

      await expect(
        chatStore.setConfigOption({
          sessionId: "session-1",
          configId: "model",
          type: "select",
          value: "haiku",
        })
      ).rejects.toBeTruthy();

      expect(sessionStore.sessions[0]!.configOptions![0]!.currentValue).toBe("sonnet");
      expect(chatStore.pendingConfigIds.has("model")).toBe(false);
    });

    it("turn-during server-push overrides optimistic value without rollback", async () => {
      const { sessionStore, chatStore } = withSession();
      let callbacks: StreamCallbacks | null = null;
      vi.mocked(chatApi.streamMessage).mockImplementation(
        (_sessionId, _workspaceId, _agentId, _prompt, nextCallbacks) => {
          callbacks = nextCallbacks;
          return () => {};
        }
      );

      let resolveSet: (response: Awaited<ReturnType<typeof chatApi.setConfigOption>>) => void;
      vi.mocked(chatApi.setConfigOption).mockReturnValue(
        new Promise((resolve) => {
          resolveSet = resolve;
        })
      );

      await chatStore.sendMessage(textParts("hi"));
      const setPromise = chatStore.setConfigOption({
        sessionId: "session-1",
        configId: "model",
        type: "select",
        value: "haiku",
      });

      callbacks!.onChunk({
        kind: "config_options_update",
        options: [
          {
            type: "select",
            id: "model",
            name: "Model",
            currentValue: "opus",
            options: [{ value: "opus", name: "Opus" }],
          },
        ],
      });

      expect(sessionStore.sessions[0]!.configOptions![0]!.currentValue).toBe("opus");

      resolveSet!({
        ok: true,
        data: {
          configOptions: [
            {
              type: "select",
              id: "model",
              name: "Model",
              currentValue: "opus",
              options: [{ value: "opus", name: "Opus" }],
            },
          ],
        },
      });

      await setPromise;
      expect(chatStore.pendingConfigIds.has("model")).toBe(false);
      expect(sessionStore.sessions[0]!.configOptions![0]!.currentValue).toBe("opus");
    });
  });
});
