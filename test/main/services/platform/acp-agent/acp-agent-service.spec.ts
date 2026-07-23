import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRegistry: vi.fn(),
  refreshRegistry: vi.fn(),
  readInstalledRecords: vi.fn(),
  removeInstalledRecord: vi.fn(),
  detectAgentStatuses: vi.fn(),
  uninstallAgent: vi.fn(),
  installAgent: vi.fn(),
  removeAgentCapabilities: vi.fn(),
  getCachedPromptCapabilities: vi.fn(),
  getOrStartProcess: vi.fn(),
  stopAgentProcess: vi.fn(),
  prewarmAgentConnections: vi.fn(),
  getAgentIcons: vi.fn(),
  readStatusCache: vi.fn(),
  writeStatusCache: vi.fn(),
  readCustomAgents: vi.fn(),
  writeCustomAgents: vi.fn(),
  listAgents: vi.fn(),
  resolveCustomCommandPath: vi.fn((command: string) => Promise.resolve(command)),
}));

vi.mock("@main/infra/storage/acp-registry-cache", () => ({
  getRegistry: mocks.getRegistry,
  refreshRegistry: mocks.refreshRegistry,
}));

vi.mock("@main/infra/storage/acp-status-cache", () => ({
  readStatusCache: mocks.readStatusCache,
  writeStatusCache: mocks.writeStatusCache,
}));

vi.mock("@main/infra/acp/detector", () => ({
  detectAgentStatuses: mocks.detectAgentStatuses,
  readInstalledRecords: mocks.readInstalledRecords,
  removeInstalledRecord: mocks.removeInstalledRecord,
}));

vi.mock("@main/services/platform/acp-agent/installer", () => ({
  installAgent: mocks.installAgent,
  uninstallAgent: mocks.uninstallAgent,
}));

vi.mock("@main/infra/storage/agent-capability-store", () => ({
  getCachedPromptCapabilities: mocks.getCachedPromptCapabilities,
  removeAgentCapabilities: mocks.removeAgentCapabilities,
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
  stopAgentProcess: mocks.stopAgentProcess,
}));

vi.mock("@main/services/platform/acp-agent/connection-warmup", () => ({
  prewarmAgentConnections: mocks.prewarmAgentConnections,
}));

vi.mock("@main/infra/storage/custom-agent-config-store", () => ({
  readCustomAgents: mocks.readCustomAgents,
  writeCustomAgents: mocks.writeCustomAgents,
}));

vi.mock("@main/infra/acp/agent-catalog", () => ({
  generateCustomAgentId: (command: string, args: string[]) =>
    `custom-${command}-${JSON.stringify(args)}`,
  getAgentById: vi.fn(),
  isCustomAgentId: (agentId: string) => agentId.startsWith("custom-"),
  listAgents: mocks.listAgents,
  resolveCustomCommandPath: mocks.resolveCustomCommandPath,
}));

vi.mock("@main/infra/storage/acp-icon-cache", () => ({
  getAgentIcons: mocks.getAgentIcons,
}));

describe("acp-agent-service uninstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stopAgentProcess.mockResolvedValue(undefined);
    mocks.prewarmAgentConnections.mockResolvedValue([]);
    mocks.uninstallAgent.mockResolvedValue(undefined);
    mocks.getRegistry.mockResolvedValue({
      agents: [
        {
          id: "claude-code",
          name: "Claude Code",
          version: "1.2.3",
          description: "ACP agent",
          authors: ["Anthropic"],
          license: "MIT",
          distribution: { npx: { package: "@anthropic/claude-code" } },
        },
      ],
    });
    mocks.readInstalledRecords.mockResolvedValue({
      "claude-code": {
        managedBy: "fyllocode",
        installMethod: "npx",
        installedVersion: "1.2.3",
        installedAt: new Date().toISOString(),
      },
    });
  });

  it("removes installed and capability records after a successful uninstall", async () => {
    const { uninstallAgentById } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await uninstallAgentById("claude-code");

    expect(mocks.stopAgentProcess).toHaveBeenCalledWith("claude-code", "uninstall");
    expect(mocks.uninstallAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "claude-code" }),
      "npx",
      expect.any(Function)
    );
    expect(mocks.removeInstalledRecord).toHaveBeenCalledWith("claude-code");
    expect(mocks.removeAgentCapabilities).toHaveBeenCalledWith("claude-code");
    expect(mocks.prewarmAgentConnections).not.toHaveBeenCalled();
  });

  it("does not remove records when uninstall fails", async () => {
    mocks.uninstallAgent.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "UNINSTALL_FAILED" })
    );
    const { uninstallAgentById } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await expect(uninstallAgentById("claude-code")).rejects.toMatchObject({
      message: "boom",
    });
    expect(mocks.removeInstalledRecord).not.toHaveBeenCalled();
    expect(mocks.removeAgentCapabilities).not.toHaveBeenCalled();
  });

  it("rejects when the installed record is missing", async () => {
    mocks.readInstalledRecords.mockResolvedValueOnce({});
    const { uninstallAgentById } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await expect(uninstallAgentById("claude-code")).rejects.toMatchObject({
      code: "AGENT_NOT_FOUND",
      message: "Agent claude-code is not installed",
    });
  });
});

describe("acp-agent-service install lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRegistry.mockResolvedValue({
      agents: [{ id: "claude-code", name: "Claude Code", distribution: {} }],
    });
    mocks.installAgent.mockResolvedValue(undefined);
    mocks.stopAgentProcess.mockResolvedValue(undefined);
    mocks.prewarmAgentConnections.mockResolvedValue([]);
  });

  it("stops an installed agent before upgrade and prewarms after success", async () => {
    const callOrder: string[] = [];
    mocks.readInstalledRecords.mockResolvedValue({
      "claude-code": { installMethod: "npx" },
    });
    mocks.stopAgentProcess.mockImplementation(async () => {
      callOrder.push("stop");
    });
    mocks.installAgent.mockImplementation(async () => {
      callOrder.push("install");
    });
    mocks.prewarmAgentConnections.mockImplementation(() => {
      callOrder.push("prewarm");
      return Promise.resolve([]);
    });
    const { installAgentById } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await installAgentById("claude-code");

    expect(callOrder).toEqual(["stop", "install", "prewarm"]);
    expect(mocks.stopAgentProcess).toHaveBeenCalledWith("claude-code", "upgrade");
    expect(mocks.prewarmAgentConnections).toHaveBeenCalledWith(["claude-code"]);
  });

  it("does not stop on first install and does not prewarm a failed install", async () => {
    mocks.readInstalledRecords.mockResolvedValue({});
    mocks.installAgent.mockRejectedValueOnce(new Error("install failed"));
    const { installAgentById } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await expect(installAgentById("claude-code")).rejects.toThrow("install failed");

    expect(mocks.stopAgentProcess).not.toHaveBeenCalled();
    expect(mocks.prewarmAgentConnections).not.toHaveBeenCalled();
  });

  it("prewarms a successful first install without stopping", async () => {
    mocks.readInstalledRecords.mockResolvedValue({});
    const { installAgentById } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await installAgentById("claude-code");

    expect(mocks.stopAgentProcess).not.toHaveBeenCalled();
    expect(mocks.prewarmAgentConnections).toHaveBeenCalledWith(["claude-code"]);
  });
});

describe("acp-agent-service custom lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stopAgentProcess.mockResolvedValue(undefined);
    mocks.prewarmAgentConnections.mockResolvedValue([]);
    mocks.detectAgentStatuses.mockResolvedValue([]);
    mocks.writeStatusCache.mockResolvedValue(undefined);
    mocks.writeCustomAgents.mockResolvedValue(undefined);
    mocks.resolveCustomCommandPath.mockImplementation((command: string) =>
      Promise.resolve(command)
    );
  });

  it("stops removed and env-changed custom agents, then prewarms the saved catalog", async () => {
    mocks.readCustomAgents.mockResolvedValue({
      agent_servers: {
        Removed: { command: "/bin/removed", args: ["acp"] },
        Changed: { command: "/bin/changed", args: ["acp"], env: { MODE: "old" } },
        ArgsChanged: { command: "/bin/args", args: ["old"] },
        CommandChanged: { command: "/bin/command-old", args: ["acp"] },
        Stable: { command: "/bin/stable", args: ["acp"] },
      },
    });
    const config = {
      agent_servers: {
        Changed: { command: "/bin/changed", args: ["acp"], env: { MODE: "new" } },
        ArgsChanged: { command: "/bin/args", args: ["new"] },
        CommandChanged: { command: "/bin/command-new", args: ["acp"] },
        Stable: { command: "/bin/stable", args: ["acp"] },
        Added: { command: "/bin/added", args: ["acp"] },
      },
    };
    mocks.listAgents.mockResolvedValue([
      { id: "registry", source: "registry" },
      { id: "custom-changed", source: "custom" },
      { id: "custom-stable", source: "custom" },
      { id: "custom-added", source: "custom" },
    ]);
    const { saveCustomAgents } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    await saveCustomAgents(config);

    expect(mocks.stopAgentProcess).toHaveBeenCalledWith(
      'custom-/bin/removed-["acp"]',
      "custom-config-change"
    );
    expect(mocks.stopAgentProcess).toHaveBeenCalledWith(
      'custom-/bin/changed-["acp"]',
      "custom-config-change"
    );
    expect(mocks.stopAgentProcess).toHaveBeenCalledWith(
      'custom-/bin/args-["old"]',
      "custom-config-change"
    );
    expect(mocks.stopAgentProcess).toHaveBeenCalledWith(
      'custom-/bin/command-old-["acp"]',
      "custom-config-change"
    );
    expect(mocks.stopAgentProcess).not.toHaveBeenCalledWith(
      'custom-/bin/stable-["acp"]',
      expect.anything()
    );
    expect(mocks.writeCustomAgents).toHaveBeenCalledWith(config);
    expect(mocks.prewarmAgentConnections).toHaveBeenCalledWith([
      "custom-changed",
      "custom-stable",
      "custom-added",
    ]);
  });
});

describe("acp-agent-service status detection", () => {
  const cachedStatuses = [
    { id: "claude-code", installed: true, managedBy: "user", updateAvailable: false },
  ];
  const freshStatuses = [
    { id: "claude-code", installed: true, managedBy: "fyllocode", updateAvailable: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRegistry.mockResolvedValue({ agents: [] });
    mocks.detectAgentStatuses.mockResolvedValue(freshStatuses);
    mocks.writeStatusCache.mockResolvedValue(undefined);
  });

  it("returns cache immediately and refreshes in the background when cache exists", async () => {
    mocks.readStatusCache.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      statuses: cachedStatuses,
    });
    const { listAgentStatuses, onAgentServiceEvent } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    const statusUpdates: unknown[] = [];
    const off = onAgentServiceEvent("statusUpdated", (payload) => statusUpdates.push(payload));

    const result = await listAgentStatuses();
    expect(result).toEqual(cachedStatuses);

    // 等待后台刷新结算
    await vi.waitFor(() => {
      expect(mocks.detectAgentStatuses).toHaveBeenCalledTimes(1);
    });
    expect(mocks.writeStatusCache).toHaveBeenCalledWith(freshStatuses);
    // 后台刷新结果通过 service 事件总线发射，由 ipc 层转发到渲染进程
    await vi.waitFor(() => {
      expect(statusUpdates).toEqual([freshStatuses]);
    });
    off();
  });

  it("detects in the foreground and writes cache when no cache exists", async () => {
    mocks.readStatusCache.mockResolvedValue(null);
    const { listAgentStatuses } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    const result = await listAgentStatuses();

    expect(result).toEqual(freshStatuses);
    expect(mocks.detectAgentStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.writeStatusCache).toHaveBeenCalledWith(freshStatuses);
  });

  it("forced detection bypasses the cache", async () => {
    const { detectAgentStatusesForced } =
      await import("@main/services/platform/acp-agent/acp-agent-service");

    const result = await detectAgentStatusesForced();

    expect(result).toEqual(freshStatuses);
    expect(mocks.readStatusCache).not.toHaveBeenCalled();
    expect(mocks.detectAgentStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.writeStatusCache).toHaveBeenCalledWith(freshStatuses);
  });
});
