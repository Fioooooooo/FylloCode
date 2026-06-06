import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";
import { chatApi, type StreamCallbacks } from "@renderer/api/chat";
import { projectApi } from "@renderer/api/project";
import type { AcpRegistry, AcpAgentStatus } from "@shared/types/acp-agent";

vi.mock("@renderer/api/chat", () => ({
  chatApi: {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    loadMessages: vi.fn(),
    persistMessage: vi.fn(),
    streamMessage: vi.fn(),
    setConfigOption: vi.fn(),
    probeEnsure: vi.fn(),
    probeClose: vi.fn(),
    probeSetConfigOption: vi.fn(),
    onProbeUpdate: vi.fn(),
  },
}));

vi.mock("@renderer/api/project", () => ({
  projectApi: {
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

function prepareDraftConversation(): void {
  const acpAgentsStore = useAcpAgentsStore();
  acpAgentsStore.registry = mockRegistry;
  acpAgentsStore.statuses = mockStatuses;

  const projectStore = useProjectStore();
  projectStore.currentProject = {
    id: "project-1",
    name: "Project 1",
    path: "/tmp/project-1",
    metaPath: "/tmp/project-1-meta.json",
    createdAt: new Date("2026-04-30T08:00:00.000Z"),
    lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
  };

  useSessionStore().beginDraftSession();
}

describe("useChatStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    vi.mocked(projectApi.list).mockResolvedValue({
      ok: true,
      data: [],
    });
    vi.mocked(chatApi.createSession).mockResolvedValue({
      ok: true,
      data: {
        id: "session-1",
        projectId: "project-1",
        agentId: "claude-code",
        title: "hello world",
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
    vi.mocked(chatApi.streamMessage).mockReturnValue(() => {});
    vi.mocked(chatApi.onProbeUpdate).mockReturnValue(vi.fn());
  });

  it("creates a real session lazily when sending the first draft message", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    const sessionStore = useSessionStore();
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    expect(chatApi.createSession).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "hello world",
      agentId: "claude-code",
    });
    expect(sessionStore.activeSessionId).toBe("session-1");
    expect(sessionStore.sessions).toHaveLength(1);
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
      {}
    );
    expect(chatStore.streamError).toBeNull();
    expect(chatStore.chatStatus).toBe("submitted");
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
        projectId: "project-1",
        agentId: "claude-code",
        title: "hello world",
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
    expect(sessionStore.activeSession?.messages).toHaveLength(0);
  });

  it("ignores a late stream error after cancelling before the first chunk", async () => {
    prepareDraftConversation();

    let callbacks: StreamCallbacks | null = null;
    const cancel = vi.fn();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

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
      status: "ready",
      acpSessionId: "acp-probe",
      configOptions: probeConfigOptions,
      availableCommands: [{ name: "init", description: "Initialize" }],
    });
    const applyProbeUpdateSpy = vi.spyOn(sessionStore, "applyProbeUpdate");
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, _callbacks, options) => {
        expect(applyProbeUpdateSpy).toHaveBeenCalledWith("claude-code", null);
        expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(false);
        expect(options).toEqual({ acpSessionId: "acp-probe" });
        return () => {};
      }
    );

    await useChatStore().sendMessage(textParts("hello world"));

    expect(chatApi.createSession).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "hello world",
      agentId: "claude-code",
      configOptions: probeConfigOptions,
      availableCommands: [{ name: "init", description: "Initialize" }],
      acpSessionId: "acp-probe",
    });
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "hello world" }],
      expect.any(Object),
      { acpSessionId: "acp-probe" }
    );
  });

  it("does not pass acpSessionId when draft probe failed", async () => {
    prepareDraftConversation();
    const sessionStore = useSessionStore();
    sessionStore.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "failed",
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
      {}
    );
    expect(applyProbeUpdateSpy).not.toHaveBeenCalledWith("claude-code", null);
  });

  it("does not read draftProbe when sending in an established session", async () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      {
        id: "session-1",
        projectId: "project-1",
        agentId: "claude-code",
        title: "Session",
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
      status: "ready",
      acpSessionId: "acp-probe",
      configOptions: [],
      availableCommands: [],
    });
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };

    await useChatStore().sendMessage(textParts("hello again"));

    expect(chatApi.createSession).not.toHaveBeenCalled();
    expect(chatApi.streamMessage).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      "claude-code",
      [{ type: "text", text: "hello again" }],
      expect.any(Object),
      {}
    );
    expect(sessionStore.draftProbeByAgent.has("claude-code")).toBe(true);
  });

  it("uses a normalized truncated first message as fallback session title", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "session-2",
        projectId: "project-1",
        agentId: "claude-code",
        title: "hello world this message is in",
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
      projectId: "project-1",
      title: "hello world this message is in",
      agentId: "claude-code",
    });
    expect(sessionStore.activeSession?.title).toBe("hello world this message is in");
  });

  it("skips system-reminder text part when building fallback session title", async () => {
    prepareDraftConversation();

    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "session-2",
        projectId: "project-1",
        agentId: "claude-code",
        title: "hello world this message is in",
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
      projectId: "project-1",
      title: "hello world this message is in",
      agentId: "claude-code",
    });
    expect(useSessionStore().activeSession?.title).toBe("hello world this message is in");
  });

  it("falls back to DEFAULT_SESSION_TITLE when all text parts are system-reminder", async () => {
    prepareDraftConversation();

    vi.mocked(chatApi.createSession).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "session-2",
        projectId: "project-1",
        agentId: "claude-code",
        title: "New Session",
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
      { type: "text", text: "<system-reminder>\nonly reminder\n</system-reminder>" },
    ]);

    expect(chatApi.createSession).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "New Session",
      agentId: "claude-code",
    });
    expect(useSessionStore().activeSession?.title).toBe("New Session");
  });

  it("extracts **标题** from the first non-reminder text part", async () => {
    prepareDraftConversation();

    const chatStore = useChatStore();
    await chatStore.sendMessage([
      { type: "text", text: "<system-reminder>\nirrelevant\n</system-reminder>" },
      { type: "text", text: "**标题**: 修复解析器内存泄漏\n\n更多说明" },
    ]);

    expect(chatApi.createSession).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "修复解析器内存泄漏",
      agentId: "claude-code",
    });
  });

  it("allows session_info_update to override the fallback title", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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

  it("routes plan_update to the session store without touching the assembler path", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
        callbacks = nextCallbacks;
        return () => {};
      }
    );

    const sessionStore = useSessionStore();
    const setSessionPlanSpy = vi.spyOn(sessionStore, "setSessionPlan");
    sessionStore.beginDraftSession();

    const chatStore = useChatStore();
    await chatStore.sendMessage(textParts("hello world"));

    callbacks!.onChunk({
      kind: "plan_update",
      entries: [{ content: "分析代码", priority: "high", status: "in_progress" }],
    });

    expect(setSessionPlanSpy).toHaveBeenCalledWith("session-1", [
      { content: "分析代码", priority: "high", status: "in_progress" },
    ]);
    expect(sessionStore.activeSession?.messages).toHaveLength(1);
  });

  it("routes reasoning_delta through the default assembler path", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
      { type: "reasoning", text: "thinking" },
    ]);
    expect(chatStore.chatStatus).toBe("streaming");
  });

  it("stores stream errors in chat state and clears active stream control", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    const cancel = vi.fn();
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
  });

  it("resetChatState only resets chat transient state", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    let callbacks: StreamCallbacks | null = null;
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
  });

  it("clears the previous error before starting a new send after failure", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    const streamCallbacks: StreamCallbacks[] = [];
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
  });

  it("returns from error to ready when a later stream run completes", async () => {
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.registry = mockRegistry;
    acpAgentsStore.statuses = mockStatuses;

    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
      metaPath: "/tmp/project-1-meta.json",
      createdAt: new Date("2026-04-30T08:00:00.000Z"),
      lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
    };

    const streamCallbacks: StreamCallbacks[] = [];
    vi.mocked(chatApi.streamMessage).mockImplementation(
      (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
  });

  describe("config options", () => {
    function withSession(): {
      sessionStore: ReturnType<typeof useSessionStore>;
      chatStore: ReturnType<typeof useChatStore>;
    } {
      const acpAgentsStore = useAcpAgentsStore();
      acpAgentsStore.registry = mockRegistry;
      acpAgentsStore.statuses = mockStatuses;

      const projectStore = useProjectStore();
      projectStore.currentProject = {
        id: "project-1",
        name: "Project 1",
        path: "/tmp/project-1",
        metaPath: "/tmp/project-1-meta.json",
        createdAt: new Date("2026-04-30T08:00:00.000Z"),
        lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
      };

      const sessionStore = useSessionStore();
      sessionStore.sessions = [
        {
          id: "session-1",
          projectId: "project-1",
          agentId: "claude-code",
          title: "Session",
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
        (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
        (_sessionId, _projectId, _agentId, _prompt, nextCallbacks) => {
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
