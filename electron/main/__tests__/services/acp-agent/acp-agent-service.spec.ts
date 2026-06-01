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
  getAgentIcons: vi.fn(),
  readStatusCache: vi.fn(),
  writeStatusCache: vi.fn(),
  getAllWindows: vi.fn(() => []),
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
}));

vi.mock("@main/infra/storage/acp-registry-cache", () => ({
  getRegistry: mocks.getRegistry,
  refreshRegistry: mocks.refreshRegistry,
}));

vi.mock("@main/infra/storage/acp-status-cache", () => ({
  readStatusCache: mocks.readStatusCache,
  writeStatusCache: mocks.writeStatusCache,
}));

vi.mock("@main/domain/acp/detector", () => ({
  detectAgentStatuses: mocks.detectAgentStatuses,
  readInstalledRecords: mocks.readInstalledRecords,
  removeInstalledRecord: mocks.removeInstalledRecord,
}));

vi.mock("@main/services/acp-agent/installer", () => ({
  installAgent: mocks.installAgent,
  uninstallAgent: mocks.uninstallAgent,
}));

vi.mock("@main/infra/storage/agent-capability-store", () => ({
  getCachedPromptCapabilities: mocks.getCachedPromptCapabilities,
  removeAgentCapabilities: mocks.removeAgentCapabilities,
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: mocks.getOrStartProcess,
}));

vi.mock("@main/infra/storage/acp-icon-cache", () => ({
  getAgentIcons: mocks.getAgentIcons,
}));

describe("acp-agent-service uninstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const { uninstallAgentById } = await import("@main/services/acp-agent/acp-agent-service");

    await uninstallAgentById("claude-code");

    expect(mocks.uninstallAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "claude-code" }),
      "npx",
      expect.any(Function)
    );
    expect(mocks.removeInstalledRecord).toHaveBeenCalledWith("claude-code");
    expect(mocks.removeAgentCapabilities).toHaveBeenCalledWith("claude-code");
  });

  it("does not remove records when uninstall fails", async () => {
    mocks.uninstallAgent.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "UNINSTALL_FAILED" })
    );
    const { uninstallAgentById } = await import("@main/services/acp-agent/acp-agent-service");

    await expect(uninstallAgentById("claude-code")).rejects.toMatchObject({
      message: "boom",
    });
    expect(mocks.removeInstalledRecord).not.toHaveBeenCalled();
    expect(mocks.removeAgentCapabilities).not.toHaveBeenCalled();
  });

  it("rejects when the installed record is missing", async () => {
    mocks.readInstalledRecords.mockResolvedValueOnce({});
    const { uninstallAgentById } = await import("@main/services/acp-agent/acp-agent-service");

    await expect(uninstallAgentById("claude-code")).rejects.toMatchObject({
      code: "AGENT_NOT_FOUND",
      message: "Agent claude-code is not installed",
    });
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
    mocks.getAllWindows.mockReturnValue([]);
    mocks.getRegistry.mockResolvedValue({ agents: [] });
    mocks.detectAgentStatuses.mockResolvedValue(freshStatuses);
    mocks.writeStatusCache.mockResolvedValue(undefined);
  });

  it("returns cache immediately and refreshes in the background when cache exists", async () => {
    mocks.readStatusCache.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      statuses: cachedStatuses,
    });
    const { listAgentStatuses } = await import("@main/services/acp-agent/acp-agent-service");

    const result = await listAgentStatuses();
    expect(result).toEqual(cachedStatuses);

    // 等待后台刷新结算
    await vi.waitFor(() => {
      expect(mocks.detectAgentStatuses).toHaveBeenCalledTimes(1);
    });
    expect(mocks.writeStatusCache).toHaveBeenCalledWith(freshStatuses);
  });

  it("detects in the foreground and writes cache when no cache exists", async () => {
    mocks.readStatusCache.mockResolvedValue(null);
    const { listAgentStatuses } = await import("@main/services/acp-agent/acp-agent-service");

    const result = await listAgentStatuses();

    expect(result).toEqual(freshStatuses);
    expect(mocks.detectAgentStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.writeStatusCache).toHaveBeenCalledWith(freshStatuses);
  });

  it("forced detection bypasses the cache", async () => {
    const { detectAgentStatusesForced } =
      await import("@main/services/acp-agent/acp-agent-service");

    const result = await detectAgentStatusesForced();

    expect(result).toEqual(freshStatuses);
    expect(mocks.readStatusCache).not.toHaveBeenCalled();
    expect(mocks.detectAgentStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.writeStatusCache).toHaveBeenCalledWith(freshStatuses);
  });
});
