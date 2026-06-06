import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { sessionProbeRegistry } from "@main/services/chat/session-probe-registry";
import { sessionProbeBus } from "@main/services/chat/session-probe-bus";

const mocks = vi.hoisted(() => ({
  agentUnavailableListener: null as ((event: { agentId: string; reason: string }) => void) | null,
  pendingProbeHandlers: new Map<string, (notification: SessionNotification) => void>(),
  getOrStartProcess: vi.fn(),
  getBundledMcpServers: vi.fn(),
  toAcpMcpServerEnv: vi.fn(),
  onAgentUnavailable: vi.fn((listener: (event: { agentId: string; reason: string }) => void) => {
    mocks.agentUnavailableListener = listener;
    return vi.fn();
  }),
  setPendingProbeHandler: vi.fn(
    (agentId: string, handler: (notification: SessionNotification) => void) => {
      mocks.pendingProbeHandlers.set(agentId, handler);
    }
  ),
  clearPendingProbeHandler: vi.fn((agentId: string) => {
    mocks.pendingProbeHandlers.delete(agentId);
  }),
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
  onAgentUnavailable: mocks.onAgentUnavailable,
  setPendingProbeHandler: mocks.setPendingProbeHandler,
  clearPendingProbeHandler: mocks.clearPendingProbeHandler,
}));

vi.mock("@main/infra/mcp/bundled-mcp-servers", () => ({
  getBundledMcpServers: mocks.getBundledMcpServers,
  toAcpMcpServerEnv: mocks.toAcpMcpServerEnv,
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

function agentUnavailableListener(): (event: { agentId: string; reason: string }) => void {
  const listener = mocks.agentUnavailableListener;
  expect(listener).toBeTypeOf("function");
  if (!listener) {
    throw new Error("Expected agent unavailable listener");
  }
  return listener;
}

describe("session-probe-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingProbeHandlers.clear();
    for (const key of sessionProbeRegistry.keys()) {
      sessionProbeRegistry.delete(key);
    }
    mocks.getOrStartProcess.mockResolvedValue({
      connection: {
        newSession: mocks.newSession,
        closeSession: mocks.closeSession,
        setSessionConfigOption: mocks.setSessionConfigOption,
      },
    });
    mocks.getBundledMcpServers.mockReturnValue([
      { name: "fyllo", command: "node", args: ["server.js"], env: { A: "B" } },
    ]);
    mocks.toAcpMcpServerEnv.mockImplementation((env: unknown) => env);
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
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    const snapshot = await ensureProbe("claude-code", "/tmp/project");

    expect(mocks.getOrStartProcess).toHaveBeenCalledWith("claude-code");
    expect(mocks.newSession).toHaveBeenCalledWith({
      cwd: "/tmp/project",
      mcpServers: [{ name: "fyllo", command: "node", args: ["server.js"], env: { A: "B" } }],
    });
    expect(snapshot).toMatchObject({
      agentId: "claude-code",
      status: "ready",
      acpSessionId: "acp-1",
    });
    expect(updates).toEqual([
      expect.objectContaining({
        agentId: "claude-code",
        snapshot: expect.objectContaining({ status: "ready", acpSessionId: "acp-1" }),
      }),
    ]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("deduplicates concurrent ensure calls", async () => {
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
    let resolveNewSession!: (value: { sessionId: string; configOptions: [] }) => void;
    mocks.newSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNewSession = resolve;
      })
    );

    const first = ensureProbe("claude-code", "/tmp/project");
    const second = ensureProbe("claude-code", "/tmp/project");
    resolveNewSession({ sessionId: "acp-1", configOptions: [] });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ acpSessionId: "acp-1" }),
      expect.objectContaining({ acpSessionId: "acp-1" }),
    ]);
    expect(mocks.newSession).toHaveBeenCalledTimes(1);
  });

  it("closes a ready probe and emits null", async () => {
    const { closeProbe, ensureProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    await closeProbe("claude-code");

    expect(sessionProbeRegistry.get("claude-code")).toBeUndefined();
    expect(mocks.closeSession).toHaveBeenCalledWith({ sessionId: "acp-1" });
    expect(onUpdate).toHaveBeenCalledWith({ agentId: "claude-code", snapshot: null });

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("does not throw when closeSession fails", async () => {
    const { closeProbe, ensureProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");
    mocks.closeSession.mockRejectedValueOnce(new Error("not implemented"));

    await expect(closeProbe("claude-code")).resolves.toBeUndefined();

    expect(sessionProbeRegistry.get("claude-code")).toBeUndefined();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("sets a probe config option and returns the latest snapshot", async () => {
    const { ensureProbe, setProbeConfigOption } =
      await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");

    const snapshot = await setProbeConfigOption({
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
      await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");

    await expect(
      setProbeConfigOption({
        agentId: "claude-code",
        configId: "model",
        type: "select",
        value: "opus",
      })
    ).rejects.toMatchObject({ code: IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE });
    expect(mocks.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("cleans probe state when the agent becomes unavailable", async () => {
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");
    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    agentUnavailableListener()({ agentId: "claude-code", reason: "crashed" });

    expect(sessionProbeRegistry.get("claude-code")).toBeUndefined();
    expect(onUpdate).toHaveBeenCalledWith({ agentId: "claude-code", snapshot: null });

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("registers a probe handler before newSession and ready snapshot starts with empty commands", async () => {
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
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

    const snapshot = await ensureProbe("claude-code", "/tmp/project");

    expect(callOrder).toEqual(["setPendingProbeHandler", "newSession"]);
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(true);
    expect(snapshot.availableCommands).toEqual([]);
  });

  it("updates the entry and re-emits when the probe handler receives available_commands_update", async () => {
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");

    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    const handler = mocks.pendingProbeHandlers.get("claude-code");
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

    expect(sessionProbeRegistry.get("claude-code")?.availableCommands).toEqual([
      { name: "init", description: "Initialize", hint: "path" },
      { name: "review", description: "Review", hint: undefined },
    ]);
    expect(updates).toEqual([
      expect.objectContaining({
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

  it("broadcasts an empty array when the agent declares no commands", async () => {
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");

    const updates: unknown[] = [];
    const onUpdate = vi.fn((payload) => updates.push(payload));
    sessionProbeBus.onUpdate(onUpdate);

    mocks.pendingProbeHandlers.get("claude-code")?.({
      sessionId: "acp-1",
      update: { sessionUpdate: "available_commands_update", availableCommands: [] },
    } as unknown as SessionNotification);

    expect(sessionProbeRegistry.get("claude-code")?.availableCommands).toEqual([]);
    expect(updates).toEqual([
      expect.objectContaining({
        snapshot: expect.objectContaining({ availableCommands: [] }),
      }),
    ]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("ignores message-stream events in the probe handler", async () => {
    const { ensureProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");

    const onUpdate = vi.fn();
    sessionProbeBus.onUpdate(onUpdate);

    mocks.pendingProbeHandlers.get("claude-code")?.({
      sessionId: "acp-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    } as unknown as SessionNotification);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(sessionProbeRegistry.get("claude-code")?.availableCommands).toEqual([]);

    sessionProbeBus.offUpdate(onUpdate);
  });

  it("clears the pending probe handler on close", async () => {
    const { ensureProbe, closeProbe } = await import("@main/services/chat/session-probe-service");
    await ensureProbe("claude-code", "/tmp/project");
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(true);

    await closeProbe("claude-code");

    expect(mocks.clearPendingProbeHandler).toHaveBeenCalledWith("claude-code");
    expect(mocks.pendingProbeHandlers.has("claude-code")).toBe(false);
  });
});
