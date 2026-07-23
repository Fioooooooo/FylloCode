import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { sessionProbeRegistry } from "@main/services/session/chat/session-probe-registry";
import { sessionProbeBus } from "@main/services/session/chat/session-probe-bus";

const mocks = vi.hoisted(() => ({
  processInvalidatedListener: null as ((event: { agentId: string; reason: string }) => void) | null,
  pendingProbeHandlers: new Map<string, (notification: SessionNotification) => void>(),
  sessionHandlers: new Map<string, (notification: SessionNotification) => void>(),
  getOrStartProcess: vi.fn(),
  resolveBundledMcpServers: vi.fn(),
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
}));

vi.mock("@main/infra/mcp/bundled-mcp-servers", () => ({
  resolveBundledMcpServers: mocks.resolveBundledMcpServers,
  toAcpMcpServer: mocks.toAcpMcpServer,
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

describe("session-probe-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingProbeHandlers.clear();
    mocks.sessionHandlers.clear();
    sessionProbeRegistry.clear();
    mocks.getOrStartProcess.mockResolvedValue({
      sessionHandlers: mocks.sessionHandlers,
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
    mocks.resolveBundledMcpServers.mockResolvedValue([
      {
        type: "stdio",
        name: "fyllo",
        command: "node",
        args: ["server.js"],
        env: { A: "B" },
      },
    ]);
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

    const snapshot = await ensureProbe("project-1", "claude-code", "/tmp/project");

    expect(mocks.getOrStartProcess).toHaveBeenCalledWith("claude-code");
    expect(mocks.resolveBundledMcpServers).toHaveBeenCalledWith({
      projectPath: "/tmp/project",
      fylloSessionId: snapshot.fylloSessionId,
      supportsHttp: false,
    });
    expect(mocks.newSession).toHaveBeenCalledWith({
      cwd: "/tmp/project",
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
    expect(updates).toEqual([
      expect.objectContaining({
        projectId: "project-1",
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

    const first = ensureProbe("project-1", "claude-code", "/tmp/project");
    const second = ensureProbe("project-1", "claude-code", "/tmp/project");
    resolveNewSession({ sessionId: "acp-1", configOptions: [] });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ acpSessionId: "acp-1" }),
      expect.objectContaining({ acpSessionId: "acp-1" }),
    ]);
    expect(mocks.newSession).toHaveBeenCalledTimes(1);
  });

  it("waits for bundled MCP readiness before calling newSession", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    let resolveServers!: (value: []) => void;
    mocks.resolveBundledMcpServers.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveServers = resolve;
      })
    );

    const probe = ensureProbe("project-1", "claude-code", "/tmp/project");
    await vi.waitFor(() => expect(mocks.resolveBundledMcpServers).toHaveBeenCalledOnce());
    expect(mocks.newSession).not.toHaveBeenCalled();

    resolveServers([]);
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

    const first = ensureProbe("project-a", "claude-code", "/tmp/project-a");
    const second = ensureProbe("project-b", "claude-code", "/tmp/project-b");

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
      projectId: "project-a",
      acpSessionId: "acp-a",
    });
    expect(sessionProbeRegistry.get("project-b", "claude-code")).toMatchObject({
      projectId: "project-b",
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

    const promise = ensureProbe("project-1", "claude-code", "/tmp/project");
    const startingEntry = sessionProbeRegistry.get("project-1", "claude-code");

    expect(startingEntry).toMatchObject({
      status: "starting",
      fylloSessionId: expect.stringMatching(/^session-/),
    });

    await vi.waitFor(() => {
      expect(mocks.resolveBundledMcpServers).toHaveBeenCalledWith({
        projectPath: "/tmp/project",
        fylloSessionId: startingEntry?.fylloSessionId,
        supportsHttp: false,
      });
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
    await ensureProbe("project-1", "claude-code", "/tmp/project");
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    await closeProbe("project-1", "claude-code");

    expect(sessionProbeRegistry.get("project-1", "claude-code")).toBeUndefined();
    expect(mocks.closeSession).toHaveBeenCalledWith({ sessionId: "acp-1" });
    expect(onUpdate).toHaveBeenCalledWith({
      projectId: "project-1",
      agentId: "claude-code",
      snapshot: null,
    });

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("does not throw when closeSession fails", async () => {
    const { closeProbe, ensureProbe } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe("project-1", "claude-code", "/tmp/project");
    mocks.closeSession.mockRejectedValueOnce(new Error("not implemented"));

    await expect(closeProbe("project-1", "claude-code")).resolves.toBeUndefined();

    expect(sessionProbeRegistry.get("project-1", "claude-code")).toBeUndefined();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("sets a probe config option and returns the latest snapshot", async () => {
    const { ensureProbe, setProbeConfigOption } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe("project-1", "claude-code", "/tmp/project");

    const snapshot = await setProbeConfigOption({
      projectId: "project-1",
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
    await ensureProbe("project-1", "claude-code", "/tmp/project");

    await expect(
      setProbeConfigOption({
        projectId: "project-1",
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
    await ensureProbe("project-1", "claude-code", "/tmp/project");
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    processInvalidatedListener()({ agentId: "claude-code", reason: "crashed" });

    expect(sessionProbeRegistry.get("project-1", "claude-code")).toBeUndefined();
    expect(onUpdate).toHaveBeenCalledWith({
      projectId: "project-1",
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
    await ensureProbe("project-a", "claude-code", "/tmp/project-a");
    await ensureProbe("project-b", "claude-code", "/tmp/project-b");
    await ensureProbe("project-a", "codex", "/tmp/project-a");
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    processInvalidatedListener()({ agentId: "claude-code", reason: "upgrade" });

    expect(sessionProbeRegistry.get("project-a", "claude-code")).toBeUndefined();
    expect(sessionProbeRegistry.get("project-b", "claude-code")).toBeUndefined();
    expect(sessionProbeRegistry.get("project-a", "codex")).toMatchObject({
      acpSessionId: "acp-other",
    });
    expect(onUpdate).toHaveBeenCalledWith({
      projectId: "project-a",
      agentId: "claude-code",
      snapshot: null,
    });
    expect(onUpdate).toHaveBeenCalledWith({
      projectId: "project-b",
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
    await ensureProbe("project-1", "claude-code", "/tmp/project");

    processInvalidatedListener()({ agentId: "claude-code", reason: "upgrade" });
    const snapshot = await ensureProbe("project-1", "claude-code", "/tmp/project");

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

    const snapshot = await ensureProbe("project-1", "claude-code", "/tmp/project");

    expect(callOrder).toEqual(["setPendingProbeHandler", "newSession"]);
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(false);
    expect(mocks.sessionHandlers.get("acp-1")).toBeTypeOf("function");
    expect(snapshot.availableCommands).toEqual([]);
  });

  it("updates the entry and re-emits when the probe handler receives available_commands_update", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe("project-1", "claude-code", "/tmp/project");

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

    expect(sessionProbeRegistry.get("project-1", "claude-code")?.availableCommands).toEqual([
      { name: "init", description: "Initialize", hint: "path" },
      { name: "review", description: "Review", hint: undefined },
    ]);
    expect(updates).toEqual([
      expect.objectContaining({
        projectId: "project-1",
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

    await ensureProbe("project-a", "claude-code", "/tmp/project-a");
    await ensureProbe("project-b", "claude-code", "/tmp/project-b");

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
    await ensureProbe("project-1", "claude-code", "/tmp/project");
    expect(mocks.sessionHandlers.has("acp-1")).toBe(true);

    const entry = await takeProbeFor("project-1", "claude-code", "acp-1");

    expect(entry).toMatchObject({ projectId: "project-1", agentId: "claude-code" });
    expect(sessionProbeRegistry.get("project-1", "claude-code")).toBeUndefined();
    expect(mocks.sessionHandlers.has("acp-1")).toBe(false);
  });

  it("broadcasts an empty array when the agent declares no commands", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe("project-1", "claude-code", "/tmp/project");

    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    mocks.sessionHandlers.get("acp-1")?.({
      sessionId: "acp-1",
      update: { sessionUpdate: "available_commands_update", availableCommands: [] },
    } as unknown as SessionNotification);

    expect(sessionProbeRegistry.get("project-1", "claude-code")?.availableCommands).toEqual([]);
    expect(updates).toEqual([
      expect.objectContaining({
        projectId: "project-1",
        snapshot: expect.objectContaining({ availableCommands: [] }),
      }),
    ]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("ignores message-stream events in the probe handler", async () => {
    const { ensureProbe } = await import("@main/services/session/chat/session-probe-service");
    await ensureProbe("project-1", "claude-code", "/tmp/project");

    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    mocks.sessionHandlers.get("acp-1")?.({
      sessionId: "acp-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    } as unknown as SessionNotification);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(sessionProbeRegistry.get("project-1", "claude-code")?.availableCommands).toEqual([]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("clears the probe handler on close", async () => {
    const { ensureProbe, closeProbe } =
      await import("@main/services/session/chat/session-probe-service");
    await ensureProbe("project-1", "claude-code", "/tmp/project");
    expect(mocks.sessionHandlers.has("acp-1")).toBe(true);

    await closeProbe("project-1", "claude-code");

    expect(mocks.clearPendingProbeHandler).toHaveBeenCalledWith(
      "claude-code",
      expect.any(Function)
    );
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(false);
    expect(mocks.sessionHandlers.has("acp-1")).toBe(false);
  });
});
