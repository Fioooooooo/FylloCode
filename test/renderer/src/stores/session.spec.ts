import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useProposalStore } from "@renderer/stores/proposal";
import { useSessionStore } from "@renderer/stores/session";
import type { Session } from "@shared/types/chat";
import type { ProposalMeta, ProposalStatusChangedPayload } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  loadMessages: vi.fn(),
  probeEnsure: vi.fn(),
  probeClose: vi.fn(),
  probeSetConfigOption: vi.fn(),
  setActionState: vi.fn(),
  onProbeUpdate: vi.fn(),
  getByTask: vi.fn(),
  getBySession: vi.fn(),
  createSession: vi.fn(),
}));

const proposalMocks = vi.hoisted(() => ({
  list: vi.fn(),
  watch: vi.fn(),
  onStatusChanged: vi.fn((handler: (payload: ProposalStatusChangedPayload) => void) => {
    proposalMocks.statusHandler = handler;
    return vi.fn();
  }),
  statusHandler: null as ((payload: ProposalStatusChangedPayload) => void) | null,
}));

vi.mock("@renderer/api/proposal", () => ({
  proposalApi: proposalMocks,
}));

vi.mock("@renderer/api/chat", () => ({
  chatApi: {
    listSessions: mocks.listSessions,
    loadMessages: mocks.loadMessages,
    createSession: mocks.createSession,
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    persistMessage: vi.fn(),
    streamMessage: vi.fn(),
    setConfigOption: vi.fn(),
    setActionState: mocks.setActionState,
    probeEnsure: mocks.probeEnsure,
    probeClose: mocks.probeClose,
    probeSetConfigOption: mocks.probeSetConfigOption,
    onProbeUpdate: mocks.onProbeUpdate,
  },
}));

vi.mock("@renderer/api/lineage", () => ({
  lineageApi: {
    getByTask: mocks.getByTask,
    getBySession: mocks.getBySession,
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
        fylloSessionId: "session-probe",
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
        fylloSessionId: "session-probe",
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
        availableCommands: [],
      },
    });
    mocks.setActionState.mockResolvedValue({
      ok: true,
      data: {
        actionStates: {
          "chat:session-1:0:0:0": {
            type: "task.create",
            status: "succeeded",
            updatedAt: "2026-06-08T00:00:00.000Z",
          },
        },
      },
    });
    mocks.onProbeUpdate.mockReturnValue(vi.fn());
    mocks.getByTask.mockResolvedValue({ ok: true, data: null });
    mocks.getBySession.mockResolvedValue({ ok: true, data: null });
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

  it("loads and caches origin task info when selecting linked sessions", async () => {
    const store = useSessionStore();
    store.sessions = [
      session({
        originTaskRef: "yunxiao:STORY-42",
      }),
    ];
    mocks.loadMessages.mockResolvedValue({ ok: true, data: [] });
    mocks.getByTask.mockResolvedValue({
      ok: true,
      data: {
        subjectId: "subject-1",
        origin: "task",
        task: {
          ref: "yunxiao:STORY-42",
          snapshot: { title: "Story title" },
          capturedAt: "2026-06-09T00:00:00.000Z",
        },
        links: [],
      },
    });

    await store.selectSession("session-1");
    await store.selectSession("session-1");

    expect(mocks.getByTask).toHaveBeenCalledTimes(1);
    expect(mocks.getByTask).toHaveBeenCalledWith("project-1", "yunxiao:STORY-42");
    expect(store.taskInfoBySessionId.get("session-1")).toEqual({
      source: "yunxiao",
      title: "Story title",
      ref: "yunxiao:STORY-42",
    });
  });

  it("falls back to the origin task ref when lineage subject is missing", async () => {
    const store = useSessionStore();
    store.sessions = [
      session({
        originTaskRef: "github:42",
      }),
    ];
    mocks.loadMessages.mockResolvedValue({ ok: true, data: [] });
    mocks.getByTask.mockResolvedValue({ ok: true, data: null });

    await store.selectSession("session-1");

    expect(store.taskInfoBySessionId.get("session-1")).toEqual({
      source: "github",
      title: "github:42",
      ref: "github:42",
    });
  });

  it("does not query task info when ensuring a session without an origin task", async () => {
    const store = useSessionStore();

    await store.ensureSessionOriginTaskInfo(session());

    expect(mocks.getByTask).not.toHaveBeenCalled();
  });

  it("does not query task info when origin task info is already cached", async () => {
    const store = useSessionStore();
    store.taskInfoBySessionId.set("session-1", {
      source: "local",
      title: "Cached task",
      ref: "local:task-1",
    });

    await store.ensureSessionOriginTaskInfo(session({ originTaskRef: "local:task-1" }));

    expect(mocks.getByTask).not.toHaveBeenCalled();
  });

  it("loads origin task info through the public lazy loader", async () => {
    const store = useSessionStore();
    mocks.getByTask.mockResolvedValue({
      ok: true,
      data: {
        subjectId: "subject-1",
        origin: "task",
        task: {
          ref: "local:task-1",
          snapshot: { title: "Lazy loaded task" },
          capturedAt: "2026-06-12T00:00:00.000Z",
        },
        links: [],
      },
    });

    await store.ensureSessionOriginTaskInfo(session({ originTaskRef: "local:task-1" }));

    expect(mocks.getByTask).toHaveBeenCalledWith("project-1", "local:task-1");
    expect(store.taskInfoBySessionId.get("session-1")).toEqual({
      source: "local",
      title: "Lazy loaded task",
      ref: "local:task-1",
    });
  });

  it("falls back to the origin task ref when the public lazy loader fails", async () => {
    const store = useSessionStore();
    mocks.getByTask.mockRejectedValue(new Error("lineage unavailable"));

    await store.ensureSessionOriginTaskInfo(session({ originTaskRef: "yunxiao:STORY-404" }));

    expect(store.taskInfoBySessionId.get("session-1")).toEqual({
      source: "yunxiao",
      title: "yunxiao:STORY-404",
      ref: "yunxiao:STORY-404",
    });
  });

  it("populates origin task info immediately after creating a linked session", async () => {
    const store = useSessionStore();
    mocks.createSession.mockResolvedValue({
      ok: true,
      data: session({ id: "session-new", originTaskRef: "yunxiao:STORY-99" }),
    });
    mocks.getByTask.mockResolvedValue({
      ok: true,
      data: {
        subjectId: "subject-1",
        origin: "task",
        task: {
          ref: "yunxiao:STORY-99",
          snapshot: { title: "Linked story" },
          capturedAt: "2026-06-11T00:00:00.000Z",
        },
        links: [],
      },
    });

    await store.createSession({
      projectId: "project-1",
      agentId: "claude-code",
      taskRef: "yunxiao:STORY-99",
    });
    await nextTick();

    expect(mocks.getByTask).toHaveBeenCalledWith("project-1", "yunxiao:STORY-99");
    expect(store.taskInfoBySessionId.get("session-new")).toEqual({
      source: "yunxiao",
      title: "Linked story",
      ref: "yunxiao:STORY-99",
    });
  });

  it("does not query task info when creating a session without an origin task", async () => {
    const store = useSessionStore();
    mocks.createSession.mockResolvedValue({
      ok: true,
      data: session({ id: "session-new" }),
    });

    await store.createSession({ projectId: "project-1", agentId: "claude-code" });
    await nextTick();

    expect(mocks.getByTask).not.toHaveBeenCalled();
    expect(store.taskInfoBySessionId.has("session-new")).toBe(false);
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

  it("setSessionAgentAgenda writes the agenda onto the matching session", () => {
    const store = useSessionStore();
    store.sessions = [session()];

    store.setSessionAgentAgenda("session-1", [
      { content: "分析代码", priority: "high", status: "in_progress" },
    ]);

    expect(store.sessions[0]?.agentAgenda).toEqual([
      { content: "分析代码", priority: "high", status: "in_progress" },
    ]);
  });

  it("setSessionAgentAgenda does nothing when session is missing", () => {
    const store = useSessionStore();
    store.setSessionAgentAgenda("missing", [{ content: "x", priority: "low", status: "pending" }]);
    expect(store.sessions).toEqual([]);
  });

  it("setSessionAgentAgenda isolates agenda between sessions", () => {
    const store = useSessionStore();
    store.sessions = [session({ id: "session-1" }), session({ id: "session-2" })];

    store.setSessionAgentAgenda("session-1", [
      { content: "仅属于 session-1", priority: "medium", status: "pending" },
    ]);

    expect(store.sessions[0]?.agentAgenda).toEqual([
      { content: "仅属于 session-1", priority: "medium", status: "pending" },
    ]);
    expect(store.sessions[1]?.agentAgenda).toBeUndefined();
  });

  it("persistSessionActionState updates memory immediately and merges IPC result", async () => {
    const store = useSessionStore();
    store.sessions = [session()];
    const state = {
      type: "task.create" as const,
      status: "succeeded" as const,
      updatedAt: "2026-06-08T00:00:00.000Z",
    };

    const promise = store.persistSessionActionState("session-1", "chat:session-1:0:0:0", state);

    expect(store.sessions[0]?.actionStates).toEqual({
      "chat:session-1:0:0:0": state,
    });
    await promise;

    expect(mocks.setActionState).toHaveBeenCalledWith({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "chat:session-1:0:0:0",
      state,
    });
    expect(store.sessions[0]?.actionStates).toEqual({
      "chat:session-1:0:0:0": state,
    });
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
      fylloSessionId: "session-probe",
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
      fylloSessionId: "session-probe",
      acpSessionId: "acp-1",
      configOptions: [],
      availableCommands: [{ name: "review", description: "Review code" }],
    });

    expect(store.draftProbeByAgent.get("claude-code")?.availableCommands).toEqual([
      { name: "review", description: "Review code" },
    ]);
    expect(store.draftProbeByAgent.get("claude-code")?.fylloSessionId).toBe("session-probe");
  });

  it("closeDraftProbe clears local state before awaiting IPC", async () => {
    const store = useSessionStore();
    store.applyProbeUpdate("claude-code", {
      agentId: "claude-code",
      status: "ready",
      fylloSessionId: "session-probe",
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
      fylloSessionId: "session-probe",
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
      fylloSessionId: "session-probe",
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

  it("setSessionOriginTaskRef updates the session originTaskRef", () => {
    const store = useSessionStore();
    store.sessions = [session()];

    store.setSessionOriginTaskRef("session-1", "local:task-new");

    expect(store.sessions[0]?.originTaskRef).toBe("local:task-new");
  });

  it("setSessionOriginTaskRef clears cached task info and reloads it", async () => {
    const store = useSessionStore();
    store.sessions = [session({ originTaskRef: "local:task-old" })];
    store.taskInfoBySessionId.set("session-1", {
      source: "local",
      title: "Old task",
      ref: "local:task-old",
    });
    mocks.getByTask.mockResolvedValue({
      ok: true,
      data: {
        subjectId: "subject-1",
        origin: "chat",
        task: {
          ref: "local:task-new",
          snapshot: { title: "New task" },
          capturedAt: "2026-06-09T00:00:00.000Z",
        },
        links: [],
      },
    });

    store.setSessionOriginTaskRef("session-1", "local:task-new");
    await nextTick();

    expect(store.sessions[0]?.originTaskRef).toBe("local:task-new");
    expect(mocks.getByTask).toHaveBeenCalledWith("project-1", "local:task-new");
    expect(store.taskInfoBySessionId.get("session-1")).toEqual({
      source: "local",
      title: "New task",
      ref: "local:task-new",
    });
  });

  function proposalMeta(overrides: Partial<ProposalMeta> = {}): ProposalMeta {
    return {
      id: "change-1",
      title: "Friendly Title",
      status: "draft",
      why: "",
      totalTasks: 0,
      doneTasks: 0,
      hasDesign: false,
      date: "2026-06-18T00:00:00.000Z",
      ...overrides,
    };
  }

  it("backfills a draft proposal from session lineage and starts watching it", async () => {
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/project/meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };
    const proposal = proposalMeta({ id: "fix-login", status: "draft" });
    const proposalStore = useProposalStore();
    proposalStore.proposals = [proposal];
    mocks.loadMessages.mockResolvedValue({ ok: true, data: [] });
    mocks.getBySession.mockResolvedValue({
      ok: true,
      data: {
        subjectId: "subject-1",
        origin: "chat",
        task: null,
        session: {
          sessionId: "session-1",
          createdAt: "2026-06-25T00:00:00.000Z",
          proposals: [{ changeId: "fix-login", createdAt: "2026-06-25T00:00:00.000Z" }],
          plans: [],
        },
      },
    });
    proposalMocks.watch.mockResolvedValue({ ok: true, data: undefined });

    const store = useSessionStore();
    store.sessions = [session()];

    await store.selectSession("session-1");
    await flushPromises();

    expect(mocks.getBySession).toHaveBeenCalledWith("project-1", "session-1");
    expect(store.sessionProposals["session-1"]).toEqual([proposal]);
    expect(proposalMocks.watch).toHaveBeenCalledTimes(1);
    expect(proposalMocks.watch).toHaveBeenCalledWith({
      projectId: "project-1",
      changeId: "fix-login",
      sessionId: "session-1",
    });
  });

  it("backfills an archived prefixed proposal from session lineage without watching it", async () => {
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/project/meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };
    const proposal = proposalMeta({
      id: "2026-06-25-fix-login",
      status: "archived",
    });
    const proposalStore = useProposalStore();
    proposalStore.proposals = [proposal];
    mocks.loadMessages.mockResolvedValue({ ok: true, data: [] });
    mocks.getBySession.mockResolvedValue({
      ok: true,
      data: {
        subjectId: "subject-1",
        origin: "chat",
        task: null,
        session: {
          sessionId: "session-1",
          createdAt: "2026-06-25T00:00:00.000Z",
          proposals: [{ changeId: "fix-login", createdAt: "2026-06-25T00:00:00.000Z" }],
          plans: [],
        },
      },
    });

    const store = useSessionStore();
    store.sessions = [session()];

    await store.selectSession("session-1");
    await flushPromises();

    expect(store.sessionProposals["session-1"]).toEqual([proposal]);
    expect(proposalMocks.watch).not.toHaveBeenCalled();
  });

  it.each([
    ["null", () => mocks.getBySession.mockResolvedValue({ ok: true, data: null })],
    [
      "an error response",
      () =>
        mocks.getBySession.mockResolvedValue({
          ok: false,
          error: { code: "LINEAGE_FAILED", message: "lineage failed" },
        }),
    ],
    ["a thrown error", () => mocks.getBySession.mockRejectedValue(new Error("lineage failed"))],
  ])(
    "keeps session selection and proposal state stable when lineage getBySession returns %s",
    async (_label, configureGetBySession) => {
      const projectStore = useProjectStore();
      projectStore.currentProject = {
        id: "project-1",
        name: "Project",
        path: "/tmp/project",
        metaPath: "/tmp/project/meta.json",
        createdAt: new Date(),
        lastOpenedAt: new Date(),
      };
      const proposalStore = useProposalStore();
      proposalStore.proposals = [proposalMeta({ id: "other-change" })];
      mocks.loadMessages.mockResolvedValue({ ok: true, data: [] });
      configureGetBySession();

      const store = useSessionStore();
      store.sessions = [session()];

      await expect(store.selectSession("session-1")).resolves.toBeUndefined();
      await flushPromises();

      expect(store.activeSessionId).toBe("session-1");
      expect(store.getSessionProposals("session-1")).toEqual([]);
      expect(proposalMocks.watch).not.toHaveBeenCalled();
    }
  );

  it("refreshes proposal store when a statusChanged event arrives for an unknown proposal", async () => {
    const projectStore = useProjectStore();
    projectStore.currentProject = {
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
      metaPath: "/tmp/project/meta.json",
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    };
    proposalMocks.list.mockResolvedValue({ ok: true, data: [proposalMeta()] });
    proposalMocks.watch.mockResolvedValue({ ok: true, data: undefined });

    const store = useSessionStore();
    store.sessions = [session()];
    store.activeSessionId = "session-1";

    proposalMocks.statusHandler?.({
      sessionId: "session-1",
      changeId: "change-1",
      projectPath: "/tmp/project",
      status: "creating",
      updatedAt: new Date().toISOString(),
    });
    await flushPromises();

    expect(proposalMocks.list).toHaveBeenCalledTimes(1);
    expect(store.getSessionProposals("session-1")[0]?.title).toBe("Friendly Title");
  });

  it("does not reload proposals when a statusChanged event arrives for a known proposal", async () => {
    const proposalStore = useProposalStore();
    proposalStore.proposals = [proposalMeta({ title: "Cached Title" })];
    proposalMocks.list.mockResolvedValue({ ok: true, data: [] });
    proposalMocks.watch.mockResolvedValue({ ok: true, data: undefined });

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

    proposalMocks.statusHandler?.({
      sessionId: "session-1",
      changeId: "change-1",
      projectPath: "/tmp/project",
      status: "creating",
      updatedAt: new Date().toISOString(),
    });
    await flushPromises();

    expect(proposalMocks.list).not.toHaveBeenCalled();
    expect(store.getSessionProposals("session-1")[0]?.title).toBe("Cached Title");
  });
});
