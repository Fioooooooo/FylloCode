import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";
import type { Session } from "@shared/types/chat";

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  loadMessages: vi.fn(),
  probeEnsure: vi.fn(),
  probeClose: vi.fn(),
  probeSetConfigOption: vi.fn(),
  onProbeUpdate: vi.fn(),
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
    setConfigOption: vi.fn(),
    probeEnsure: mocks.probeEnsure,
    probeClose: mocks.probeClose,
    probeSetConfigOption: mocks.probeSetConfigOption,
    onProbeUpdate: mocks.onProbeUpdate,
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
    vi.useRealTimers();
    setActivePinia(createPinia());
    mocks.probeEnsure.mockResolvedValue({
      ok: true,
      data: {
        agentId: "claude-code",
        status: "ready",
        acpSessionId: "acp-1",
        configOptions: [],
        availableCommands: [{ name: "init", description: "Initialize" }],
      },
    });
    mocks.probeClose.mockResolvedValue({ ok: true, data: undefined });
    mocks.probeSetConfigOption.mockResolvedValue({
      ok: true,
      data: {
        agentId: "claude-code",
        status: "ready",
        acpSessionId: "acp-1",
        configOptions: [
          {
            type: "select",
            id: "model",
            name: "Model",
            currentValue: "sonnet",
            options: [{ value: "sonnet", name: "Sonnet" }],
          },
        ],
      },
    });
    mocks.onProbeUpdate.mockReturnValue(vi.fn());
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

  it("setSessionPlan writes the plan onto the matching session", () => {
    const store = useSessionStore();
    store.sessions = [session()];

    store.setSessionPlan("session-1", [
      { content: "分析代码", priority: "high", status: "in_progress" },
    ]);

    expect(store.sessions[0]?.plan).toEqual([
      { content: "分析代码", priority: "high", status: "in_progress" },
    ]);
  });

  it("setSessionPlan does nothing when session is missing", () => {
    const store = useSessionStore();
    store.setSessionPlan("missing", [{ content: "x", priority: "low", status: "pending" }]);
    expect(store.sessions).toEqual([]);
  });

  it("setSessionPlan isolates plan between sessions", () => {
    const store = useSessionStore();
    store.sessions = [session({ id: "session-1" }), session({ id: "session-2" })];

    store.setSessionPlan("session-1", [
      { content: "仅属于 session-1", priority: "medium", status: "pending" },
    ]);

    expect(store.sessions[0]?.plan).toEqual([
      { content: "仅属于 session-1", priority: "medium", status: "pending" },
    ]);
    expect(store.sessions[1]?.plan).toBeUndefined();
  });

  it("ensureDraftProbe stores a ready snapshot", async () => {
    const store = useSessionStore();

    await store.ensureDraftProbe("claude-code", "project-1");

    expect(mocks.probeEnsure).toHaveBeenCalledWith({
      agentId: "claude-code",
      projectId: "project-1",
    });
    expect(store.draftProbeByAgent.get("claude-code")).toMatchObject({
      status: "ready",
      acpSessionId: "acp-1",
    });
  });

  it("ensureDraftProbe carries availableCommands from the probe snapshot", async () => {
    const store = useSessionStore();

    await store.ensureDraftProbe("claude-code", "project-1");

    expect(store.draftProbeByAgent.get("claude-code")?.availableCommands).toEqual([
      { name: "init", description: "Initialize" },
    ]);
  });

  it("applyProbeUpdate writes availableCommands into the draft probe state", () => {
    const store = useSessionStore();
    store.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      configOptions: [],
      availableCommands: [{ name: "review", description: "Review code" }],
    });

    expect(store.draftProbeByAgent.get("claude-code")?.availableCommands).toEqual([
      { name: "review", description: "Review code" },
    ]);
  });

  it("closeDraftProbe clears local state before awaiting IPC", async () => {
    const store = useSessionStore();
    store.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      configOptions: [],
      availableCommands: [],
    });

    const promise = store.closeDraftProbe("claude-code");

    expect(store.draftProbeByAgent.has("claude-code")).toBe(false);
    await promise;
    expect(mocks.probeClose).toHaveBeenCalledWith({ agentId: "claude-code" });
  });

  it("setDraftConfigOption optimistically updates and clears pending", async () => {
    const store = useSessionStore();
    const chatStore = useChatStore();
    store.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [
            { value: "haiku", name: "Haiku" },
            { value: "sonnet", name: "Sonnet" },
          ],
        },
      ],
      availableCommands: [],
    });

    const promise = store.setDraftConfigOption({
      agentId: "claude-code",
      configId: "model",
      type: "select",
      value: "sonnet",
    });

    expect(store.draftProbeByAgent.get("claude-code")?.configOptions[0]?.currentValue).toBe(
      "sonnet"
    );
    expect(chatStore.pendingConfigIds.has("model")).toBe(true);
    await promise;
    expect(chatStore.pendingConfigIds.has("model")).toBe(false);
    expect(mocks.probeSetConfigOption).toHaveBeenCalledWith({
      agentId: "claude-code",
      configId: "model",
      type: "select",
      value: "sonnet",
    });
  });

  it("draftAgentId watcher closes old probe immediately and debounces ensure", async () => {
    vi.useFakeTimers();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.statuses = {
      "claude-code": { id: "claude-code", installed: true },
      codex: { id: "codex", installed: true },
    } as never;
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/project/meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };
    const store = useSessionStore();
    store.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
      configOptions: [],
      availableCommands: [],
    });

    store.setDraftAgent("claude-code");
    await nextTick();
    store.setDraftAgent("codex");
    await nextTick();

    expect(store.draftProbeByAgent.has("claude-code")).toBe(false);
    expect(mocks.probeEnsure).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(199);
    expect(mocks.probeEnsure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.probeEnsure).toHaveBeenCalledTimes(1);
    expect(mocks.probeEnsure).toHaveBeenCalledWith({ agentId: "codex", projectId: "project-1" });
  });

  it("draftAgentId watcher does not probe established sessions", async () => {
    vi.useFakeTimers();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.statuses = {
      codex: { id: "codex", installed: true },
    } as never;
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/project/meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };
    const store = useSessionStore();
    store.sessions = [session()];
    store.activeSessionId = "session-1";

    store.setDraftAgent("codex");
    await vi.advanceTimersByTimeAsync(250);

    expect(mocks.probeEnsure).not.toHaveBeenCalled();
    expect(mocks.probeClose).not.toHaveBeenCalled();
  });

  it("beginDraftSession re-probes the carried-over agent without an agent change", async () => {
    vi.useFakeTimers();
    const acpAgentsStore = useAcpAgentsStore();
    acpAgentsStore.statuses = {
      "claude-code": { id: "claude-code", installed: true },
    } as never;
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/project/meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };
    const store = useSessionStore();
    // Simulate the post-send state: an established session for agent A whose
    // draft probe entry was already cleared by applyProbeUpdate(agentId, null).
    store.sessions = [session()];
    store.activeSessionId = "session-1";
    await vi.advanceTimersByTimeAsync(250);
    expect(store.draftProbeByAgent.has("claude-code")).toBe(false);

    // Clicking the sidebar plus-icon re-enters the draft state with the same
    // agent. effectiveAgentId stays "claude-code", so the watcher won't fire.
    store.beginDraftSession();
    expect(store.activeSessionId).toBe(null);
    expect(store.draftAgentId).toBe("claude-code");

    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.probeEnsure).toHaveBeenCalledTimes(1);
    expect(mocks.probeEnsure).toHaveBeenCalledWith({
      agentId: "claude-code",
      projectId: "project-1",
    });
  });
});
