import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { sessionProbeRegistry } from "@main/services/chat/session-probe-registry";
import { sessionProbeBus } from "@main/services/chat/session-probe-bus";

const mocks = vi.hoisted(() => ({
  agentUnavailableListener: null as ((event: { agentId: string; reason: string }) => void) | null,
  getOrStartProcess: vi.fn(),
  getBundledMcpServers: vi.fn(),
  toAcpMcpServerEnv: vi.fn(),
  onAgentUnavailable: vi.fn((listener: (event: { agentId: string; reason: string }) => void) => {
    mocks.agentUnavailableListener = listener;
    return vi.fn();
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
});
