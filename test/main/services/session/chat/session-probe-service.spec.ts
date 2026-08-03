import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { sessionProbeRegistry } from "@main/services/session/chat/session-probe-registry";
import { sessionProbeBus } from "@main/services/session/chat/session-probe-bus";

const mocks = vi.hoisted(() => ({
  processInvalidatedListener: null as ((event: { agentId: string; reason: string }) => void) | null,
  pendingProbeHandlers: new Map<string, (notification: SessionNotification) => void>(),
  sessionHandlers: new Map<string, (notification: SessionNotification) => void>(),
  activeSessionIds: new Set<string>(),
  mcpActivationBySessionId: new Map<string, string>(),
  getOrStartProcess: vi.fn(),
  createBundledMcpActivation: vi.fn(),
  revokeBundledMcpActivation: vi.fn(),
  createSessionMcpWorkspaceDescriptor: vi.fn(),
  hasActiveMcpActivation: vi.fn(),
  toAcpMcpServer: vi.fn(),
  onAgentProcessInvalidated: vi.fn(
    (listener: (event: { agentId: string; reason: string }) => void) => {
      mocks.processInvalidatedListener = listener;
      return vi.fn();
    }
  ),
  setPendingProbeHandler: vi.fn(
    (agentId: string, handler: (notification: SessionNotification) => void) => {
      mocks.pendingProbeHandlers.set(agentId, handler);
    }
  ),
  clearPendingProbeHandler: vi.fn(
    (agentId: string, handler?: (notification: SessionNotification) => void) => {
      const current = mocks.pendingProbeHandlers.get(agentId);
      if (handler === undefined || current === handler) {
        mocks.pendingProbeHandlers.delete(agentId);
      }
    }
  ),
  markAcpSessionActive: vi.fn(
    (
      entry: {
        activeSessionIds: Set<string>;
        mcpActivationBySessionId: Map<string, string>;
      },
      sessionId: string,
      activationId: string | null
    ) => {
      entry.activeSessionIds.add(sessionId);
      if (activationId) {
        entry.mcpActivationBySessionId.set(sessionId, activationId);
      }
    }
  ),
  forgetActiveAcpSession: vi.fn(
    (
      entry: {
        activeSessionIds: Set<string>;
        mcpActivationBySessionId: Map<string, string>;
      },
      sessionId: string
    ) => {
      entry.activeSessionIds.delete(sessionId);
      entry.mcpActivationBySessionId.delete(sessionId);
    }
  ),
  newSession: vi.fn(),
  closeSession: vi.fn(),
  setSessionConfigOption: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
  onAgentProcessInvalidated: mocks.onAgentProcessInvalidated,
  setPendingProbeHandler: mocks.setPendingProbeHandler,
  clearPendingProbeHandler: mocks.clearPendingProbeHandler,
  markAcpSessionActive: mocks.markAcpSessionActive,
  forgetActiveAcpSession: mocks.forgetActiveAcpSession,
  hasActiveMcpActivation: mocks.hasActiveMcpActivation,
}));

vi.mock("@main/infra/mcp/bundled-mcp-servers", () => ({
  createBundledMcpActivation: mocks.createBundledMcpActivation,
  revokeBundledMcpActivation: mocks.revokeBundledMcpActivation,
  toAcpMcpServer: mocks.toAcpMcpServer,
}));

vi.mock("@main/services/session/chat/mcp-workspace-descriptor", () => ({
  createSessionMcpWorkspaceDescriptor: mocks.createSessionMcpWorkspaceDescriptor,
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

function processInvalidatedListener(): (event: { agentId: string; reason: string }) => void {
  const listener = mocks.processInvalidatedListener;
  expect(listener).toBeTypeOf("function");
  if (!listener) {
    throw new Error("Expected process invalidated listener");
  }
  return listener;
}

function workspaceSnapshot(workspaceId: string, cwd: string, additionalDirectories: string[] = []) {
  return {
    workspaceId,
    workspaceKind: additionalDirectories.length > 0 ? ("collection" as const) : ("folder" as const),
    primaryFolderId: "folder-primary",
    folders: [
      { folderId: "folder-primary", folderName: "Primary", folderPath: cwd },
      ...additionalDirectories.map((folderPath, index) => ({
        folderId: `folder-${index + 1}`,
        folderName: `Secondary ${index + 1}`,
        folderPath,
      })),
    ],
    cwd,
    additionalDirectories,
  };
}

describe("session-probe-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingProbeHandlers.clear();
    mocks.sessionHandlers.clear();
    mocks.activeSessionIds.clear();
    mocks.mcpActivationBySessionId.clear();
    sessionProbeRegistry.clear();
    mocks.getOrStartProcess.mockResolvedValue({
      agentId: "claude-code",
      sessionHandlers: mocks.sessionHandlers,
      activeSessionIds: mocks.activeSessionIds,
      mcpActivationBySessionId: mocks.mcpActivationBySessionId,
      connection: {
        newSession: mocks.newSession,
        closeSession: mocks.closeSession,
        setSessionConfigOption: mocks.setSessionConfigOption,
      },
      initializeResponse: {
        protocolVersion: 1,
        agentCapabilities: {},
      },
    });
    mocks.hasActiveMcpActivation.mockImplementation(
      (entry: { mcpActivationBySessionId: Map<string, string> }, sessionId: string) =>
        entry.mcpActivationBySessionId.has(sessionId)
    );
    mocks.createSessionMcpWorkspaceDescriptor.mockImplementation(
      async (snapshot: ReturnType<typeof workspaceSnapshot>, sessionId: string) => ({
        version: 2,
        workspaceId: snapshot.workspaceId,
        workspaceKind: snapshot.workspaceKind,
        primaryFolderId: snapshot.primaryFolderId,
        sessionId,
        folders: snapshot.folders.map((folder) => ({
          ...folder,
          workspaceDataDir: `/tmp/data/${folder.folderId}`,
          mcpEventsDir: `/tmp/events/${folder.folderId}`,
        })),
      })
    );
    mocks.createBundledMcpActivation.mockImplementation(
      async ({ descriptor }: { descriptor: { sessionId: string } }) => ({
        activationId: `activation-${descriptor.sessionId}`,
        servers: [
          {
            type: "stdio",
            name: "fyllo",
            command: "node",
            args: ["server.js"],
            env: { A: "B" },
          },
        ],
      })
    );
    mocks.toAcpMcpServer.mockImplementation((spec: unknown) => {
      const value = spec as {
        name: string;
        command: string;
        args: string[];
        env: Record<string, string>;
      };
      return {
        name: value.name,
        command: value.command,
        args: value.args,
        env: Object.entries(value.env).map(([name, value]) => ({ name, value })),
      };
    });
    mocks.newSession.mockResolvedValue({
      sessionId: "acp-1",
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "sonnet",
          options: [{ value: "sonnet", name: "Sonnet" }],
        },
      ],
    });
    mocks.closeSession.mockResolvedValue(undefined);
    mocks.setSessionConfigOption.mockResolvedValue({
      configOptions: [
        {
          type: "select",
          id: "model",
          name: "Model",
          currentValue: "haiku",
          options: [{ value: "haiku", name: "Haiku" }],
        },
      ],
    });
  });

  it("ensures a probe for the first time and emits a ready snapshot", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    const snapshot = await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project", ["/tmp/secondary"])
    );

    expect(mocks.getOrStartProcess).toHaveBeenCalledWith("claude-code");
    expect(mocks.createSessionMcpWorkspaceDescriptor).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", cwd: "/tmp/project" }),
      snapshot.fylloSessionId
    );
    expect(mocks.createBundledMcpActivation).toHaveBeenCalledWith({
      agentId: "claude-code",
      descriptor: expect.objectContaining({
        workspaceId: "workspace-1",
        sessionId: snapshot.fylloSessionId,
      }),
      supportsHttp: false,
    });
    expect(mocks.newSession).toHaveBeenCalledWith({
      cwd: "/tmp/project",
      additionalDirectories: ["/tmp/secondary"],
      mcpServers: [
        {
          name: "fyllo",
          command: "node",
          args: ["server.js"],
          env: [{ name: "A", value: "B" }],
        },
      ],
    });
    expect(snapshot).toMatchObject({
      agentId: "claude-code",
      status: "ready",
      fylloSessionId: expect.stringMatching(/^session-/),
      acpSessionId: "acp-1",
    });
    expect(mocks.sessionHandlers.get("acp-1")).toBeTypeOf("function");
    expect(mocks.activeSessionIds.has("acp-1")).toBe(true);
    expect(mocks.mcpActivationBySessionId.get("acp-1")).toBe(
      `activation-${snapshot.fylloSessionId}`
    );
    expect(updates).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        agentId: "claude-code",
        snapshot: expect.objectContaining({
          status: "ready",
          fylloSessionId: snapshot.fylloSessionId,
          acpSessionId: "acp-1",
        }),
      }),
    ]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("deduplicates concurrent ensure calls", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    let resolveNewSession!: (value: { sessionId: string; configOptions: [] }) => void;
    mocks.newSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNewSession = resolve;
      })
    );

    const first = ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    const second = ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    resolveNewSession({ sessionId: "acp-1", configOptions: [] });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ acpSessionId: "acp-1" }),
      expect.objectContaining({ acpSessionId: "acp-1" }),
    ]);
    expect(mocks.newSession).toHaveBeenCalledTimes(1);
  });

  it("waits for bundled MCP readiness before calling newSession", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    let resolveActivation!: (value: { activationId: string; servers: [] }) => void;
    mocks.createBundledMcpActivation.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveActivation = resolve;
      })
    );

    const probe = ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    await vi.waitFor(() => expect(mocks.createBundledMcpActivation).toHaveBeenCalledOnce());
    expect(mocks.newSession).not.toHaveBeenCalled();

    resolveActivation({ activationId: "activation-waiting", servers: [] });
    await expect(probe).resolves.toMatchObject({ status: "ready", acpSessionId: "acp-1" });
    expect(mocks.newSession).toHaveBeenCalledOnce();
  });

  it("serializes concurrent draft probe starts for the same agent across projects", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    const pendingStarts: Array<{
      cwd: string;
      resolve: (value: { sessionId: string; configOptions: [] }) => void;
    }> = [];
    mocks.newSession.mockImplementation(
      (input: { cwd: string }) =>
        new Promise((resolve) => {
          pendingStarts.push({ cwd: input.cwd, resolve });
        })
    );

    const first = ensureProbe(
      "project-a",
      "claude-code",
      workspaceSnapshot("project-a", "/tmp/project-a")
    );
    const second = ensureProbe(
      "project-b",
      "claude-code",
      workspaceSnapshot("project-b", "/tmp/project-b")
    );

    await vi.waitFor(() => expect(pendingStarts).toHaveLength(1));
    expect(pendingStarts[0]?.cwd).toBe("/tmp/project-a");
    expect(mocks.newSession).toHaveBeenCalledTimes(1);

    pendingStarts[0]?.resolve({ sessionId: "acp-a", configOptions: [] });

    await vi.waitFor(() => expect(pendingStarts).toHaveLength(2));
    expect(pendingStarts[1]?.cwd).toBe("/tmp/project-b");
    expect(mocks.sessionHandlers.get("acp-a")).toBeTypeOf("function");

    pendingStarts[1]?.resolve({ sessionId: "acp-b", configOptions: [] });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ acpSessionId: "acp-a" }),
      expect.objectContaining({ acpSessionId: "acp-b" }),
    ]);
    expect(sessionProbeRegistry.get("project-a", "claude-code")).toMatchObject({
      workspaceId: "project-a",
      acpSessionId: "acp-a",
    });
    expect(sessionProbeRegistry.get("project-b", "claude-code")).toMatchObject({
      workspaceId: "project-b",
      acpSessionId: "acp-b",
    });
    expect(mocks.sessionHandlers.get("acp-b")).toBeTypeOf("function");
  });

  it("creates a starting entry with fylloSessionId before newSession resolves", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    let resolveNewSession!: (value: { sessionId: string; configOptions: [] }) => void;
    mocks.newSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNewSession = resolve;
      })
    );

    const promise = ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    const startingEntry = sessionProbeRegistry.get("workspace-1", "claude-code");

    expect(startingEntry).toMatchObject({
      status: "starting",
      fylloSessionId: expect.stringMatching(/^session-/),
    });

    await vi.waitFor(() => {
      expect(mocks.createBundledMcpActivation).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "claude-code",
          descriptor: expect.objectContaining({
            workspaceId: "workspace-1",
            sessionId: startingEntry?.fylloSessionId,
          }),
        })
      );
    });

    resolveNewSession({ sessionId: "acp-1", configOptions: [] });
    await expect(promise).resolves.toMatchObject({
      fylloSessionId: startingEntry?.fylloSessionId,
      acpSessionId: "acp-1",
    });
  });

  it("closes a ready probe and emits null", async () => {
    const { closeProbe, ensureProbe } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    await closeProbe("workspace-1", "claude-code");

    expect(sessionProbeRegistry.get("workspace-1", "claude-code")).toBeUndefined();
    expect(mocks.forgetActiveAcpSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "claude-code" }),
      "acp-1"
    );
    expect(mocks.closeSession).toHaveBeenCalledWith({ sessionId: "acp-1" });
    expect(mocks.activeSessionIds.has("acp-1")).toBe(false);
    expect(mocks.mcpActivationBySessionId.has("acp-1")).toBe(false);
    expect(onUpdate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      agentId: "claude-code",
      snapshot: null,
    });

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("does not throw when closeSession fails", async () => {
    const { closeProbe, ensureProbe } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    mocks.closeSession.mockRejectedValueOnce(new Error("not implemented"));

    await expect(closeProbe("workspace-1", "claude-code")).resolves.toBeUndefined();

    expect(sessionProbeRegistry.get("workspace-1", "claude-code")).toBeUndefined();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("sets a probe config option and returns the latest snapshot", async () => {
    const { ensureProbe, setProbeConfigOption } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    const snapshot = await setProbeConfigOption({
      workspaceId: "workspace-1",
      agentId: "claude-code",
      configId: "model",
      type: "select",
      value: "sonnet",
    });

    expect(mocks.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "model",
      value: "sonnet",
    });
    expect(snapshot.configOptions[0]).toMatchObject({ id: "model", currentValue: "haiku" });
  });

  it("rejects invalid probe config option values", async () => {
    const { ensureProbe, setProbeConfigOption } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    await expect(
      setProbeConfigOption({
        workspaceId: "workspace-1",
        agentId: "claude-code",
        configId: "model",
        type: "select",
        value: "opus",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE });
    expect(mocks.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("cleans probe state when the agent process is invalidated", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    processInvalidatedListener()({ agentId: "claude-code", reason: "crashed" });

    expect(sessionProbeRegistry.get("workspace-1", "claude-code")).toBeUndefined();
    expect(onUpdate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      agentId: "claude-code",
      snapshot: null,
    });

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("clears one agent across projects, preserves other agents, and emits project updates", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    mocks.newSession
      .mockResolvedValueOnce({ sessionId: "acp-a", configOptions: [] })
      .mockResolvedValueOnce({ sessionId: "acp-b", configOptions: [] })
      .mockResolvedValueOnce({ sessionId: "acp-other", configOptions: [] });
    await ensureProbe("project-a", "claude-code", workspaceSnapshot("project-a", "/tmp/project-a"));
    await ensureProbe("project-b", "claude-code", workspaceSnapshot("project-b", "/tmp/project-b"));
    await ensureProbe("project-a", "codex", workspaceSnapshot("project-a", "/tmp/project-a"));
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    processInvalidatedListener()({ agentId: "claude-code", reason: "upgrade" });

    expect(sessionProbeRegistry.get("project-a", "claude-code")).toBeUndefined();
    expect(sessionProbeRegistry.get("project-b", "claude-code")).toBeUndefined();
    expect(sessionProbeRegistry.get("project-a", "codex")).toMatchObject({
      acpSessionId: "acp-other",
    });
    expect(onUpdate).toHaveBeenCalledWith({
      workspaceId: "project-a",
      agentId: "claude-code",
      snapshot: null,
    });
    expect(onUpdate).toHaveBeenCalledWith({
      workspaceId: "project-b",
      agentId: "claude-code",
      snapshot: null,
    });
    expect(onUpdate).toHaveBeenCalledTimes(2);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("creates a fresh session when ensureProbe runs after invalidation", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    mocks.newSession
      .mockResolvedValueOnce({ sessionId: "acp-old", configOptions: [] })
      .mockResolvedValueOnce({ sessionId: "acp-new", configOptions: [] });
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    processInvalidatedListener()({ agentId: "claude-code", reason: "upgrade" });
    const snapshot = await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    expect(mocks.newSession).toHaveBeenCalledTimes(2);
    expect(snapshot.acpSessionId).toBe("acp-new");
  });

  it("registers a probe handler before newSession and ready snapshot starts with empty commands", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    const callOrder: string[] = [];
    mocks.setPendingProbeHandler.mockImplementationOnce(
      (agentId: string, handler: (notification: SessionNotification) => void) => {
        callOrder.push("setPendingProbeHandler");
        mocks.pendingProbeHandlers.set(agentId, handler);
      }
    );
    mocks.newSession.mockImplementationOnce(async () => {
      callOrder.push("newSession");
      return { sessionId: "acp-1", configOptions: [] };
    });

    const snapshot = await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    expect(callOrder).toEqual(["setPendingProbeHandler", "newSession"]);
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(false);
    expect(mocks.sessionHandlers.get("acp-1")).toBeTypeOf("function");
    expect(snapshot.availableCommands).toEqual([]);
  });

  it("updates the entry and re-emits when the probe handler receives available_commands_update", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    const handler = mocks.sessionHandlers.get("acp-1");
    expect(handler).toBeTypeOf("function");
    handler?.({
      sessionId: "acp-1",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "init", description: "Initialize", input: { hint: "path" } },
          { name: "review", description: "Review" },
        ],
      },
    } as unknown as SessionNotification);

    expect(sessionProbeRegistry.get("workspace-1", "claude-code")?.availableCommands).toEqual([
      { name: "init", description: "Initialize", hint: "path" },
      { name: "review", description: "Review", hint: undefined },
    ]);
    expect(updates).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        agentId: "claude-code",
        snapshot: expect.objectContaining({
          availableCommands: [
            { name: "init", description: "Initialize", hint: "path" },
            { name: "review", description: "Review", hint: undefined },
          ],
        }),
      }),
    ]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("keeps available commands isolated for the same agent in different projects", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    mocks.newSession
      .mockResolvedValueOnce({ sessionId: "acp-a", configOptions: [] })
      .mockResolvedValueOnce({ sessionId: "acp-b", configOptions: [] });

    await ensureProbe("project-a", "claude-code", workspaceSnapshot("project-a", "/tmp/project-a"));
    await ensureProbe("project-b", "claude-code", workspaceSnapshot("project-b", "/tmp/project-b"));

    mocks.sessionHandlers.get("acp-a")?.({
      sessionId: "acp-a",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "a", description: "Project A" }],
      },
    } as unknown as SessionNotification);
    mocks.sessionHandlers.get("acp-b")?.({
      sessionId: "acp-b",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "b", description: "Project B" }],
      },
    } as unknown as SessionNotification);

    expect(sessionProbeRegistry.get("project-a", "claude-code")?.availableCommands).toEqual([
      { name: "a", description: "Project A", hint: undefined },
    ]);
    expect(sessionProbeRegistry.get("project-b", "claude-code")?.availableCommands).toEqual([
      { name: "b", description: "Project B", hint: undefined },
    ]);
  });

  it("takes a probe for chat and clears its probe-only session handler", async () => {
    const { ensureProbe, takeProbeFor } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    expect(mocks.sessionHandlers.has("acp-1")).toBe(true);

    const entry = await takeProbeFor("workspace-1", "claude-code", "acp-1");

    expect(entry).toMatchObject({ workspaceId: "workspace-1", agentId: "claude-code" });
    expect(entry?.mcpActivationId).toBeTruthy();
    expect(sessionProbeRegistry.get("workspace-1", "claude-code")).toBeUndefined();
    expect(mocks.sessionHandlers.has("acp-1")).toBe(false);
    expect(mocks.activeSessionIds.has("acp-1")).toBe(true);
    expect(mocks.revokeBundledMcpActivation).not.toHaveBeenCalled();
  });

  it("revokes an unbound activation when probe creation fails", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    mocks.createBundledMcpActivation.mockResolvedValueOnce({
      activationId: "activation-failed",
      servers: [],
    });
    mocks.newSession.mockRejectedValueOnce(new Error("new session failed"));

    await expect(
      ensureProbe("workspace-1", "claude-code", workspaceSnapshot("workspace-1", "/tmp/project"))
    ).rejects.toMatchObject({ code: IpcErrorCodes.ACP_ERROR });

    expect(mocks.revokeBundledMcpActivation).toHaveBeenCalledWith("activation-failed");
    expect(mocks.mcpActivationBySessionId.size).toBe(0);
  });

  it("replaces a ready probe whose MCP activation is no longer valid", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    mocks.newSession
      .mockResolvedValueOnce({ sessionId: "acp-old", configOptions: [] })
      .mockResolvedValueOnce({ sessionId: "acp-new", configOptions: [] });

    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    mocks.hasActiveMcpActivation.mockReturnValueOnce(false);

    const snapshot = await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    expect(mocks.closeSession).toHaveBeenCalledWith({ sessionId: "acp-old" });
    expect(mocks.newSession).toHaveBeenCalledTimes(2);
    expect(snapshot.acpSessionId).toBe("acp-new");
  });

  it("broadcasts an empty array when the agent declares no commands", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    mocks.sessionHandlers.get("acp-1")?.({
      sessionId: "acp-1",
      update: { sessionUpdate: "available_commands_update", availableCommands: [] },
    } as unknown as SessionNotification);

    expect(sessionProbeRegistry.get("workspace-1", "claude-code")?.availableCommands).toEqual([]);
    expect(updates).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        snapshot: expect.objectContaining({ availableCommands: [] }),
      }),
    ]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("ignores message-stream events in the probe handler", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );

    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    mocks.sessionHandlers.get("acp-1")?.({
      sessionId: "acp-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    } as unknown as SessionNotification);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(sessionProbeRegistry.get("workspace-1", "claude-code")?.availableCommands).toEqual([]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("clears the probe handler on close", async () => {
    const { ensureProbe, closeProbe } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe(
      "workspace-1",
      "claude-code",
      workspaceSnapshot("workspace-1", "/tmp/project")
    );
    expect(mocks.sessionHandlers.has("acp-1")).toBe(true);

    await closeProbe("workspace-1", "claude-code");

    expect(mocks.clearPendingProbeHandler).toHaveBeenCalledWith(
      "claude-code",
      expect.any(Function)
    );
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(false);
    expect(mocks.sessionHandlers.has("acp-1")).toBe(false);
  });
});
