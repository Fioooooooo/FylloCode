import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { acpAgentsApi } from "@renderer/api/acp-agents";
import type { AcpRegistry, AcpAgentStatus } from "@shared/types/acp-agent";

let agentUnavailableListener: ((event: { agentId: string; reason: string }) => void) | null = null;

vi.mock("@renderer/api/acp-agents", () => ({
  acpAgentsApi: {
    getRegistry: vi.fn(),
    refreshRegistry: vi.fn(),
    getIcons: vi.fn(),
    detectStatus: vi.fn(),
    install: vi.fn(),
    ensureAgent: vi.fn(),
    loadCapabilitiesCache: vi.fn(),
    onRegistryUpdated: vi.fn(() => () => {}),
    onInstallProgress: vi.fn(() => () => {}),
    onAgentUnavailable: vi.fn((listener) => {
      agentUnavailableListener = listener;
      return () => {};
    }),
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

const mockStatuses: AcpAgentStatus[] = [
  {
    id: "claude-code",
    installed: true,
    detectedVersion: "1.2.3",
    managedBy: "fyllocode",
    updateAvailable: false,
    latestVersion: "1.2.3",
  },
];

describe("useAcpAgentsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    agentUnavailableListener = null;

    vi.mocked(acpAgentsApi.getRegistry).mockResolvedValue({
      ok: true,
      data: mockRegistry,
    });
    vi.mocked(acpAgentsApi.refreshRegistry).mockResolvedValue({
      ok: true,
      data: mockRegistry,
    });
    vi.mocked(acpAgentsApi.getIcons).mockResolvedValue({
      ok: true,
      data: { "claude-code": "data:image/png;base64,abc" },
    });
    vi.mocked(acpAgentsApi.detectStatus).mockResolvedValue({
      ok: true,
      data: mockStatuses,
    });
    vi.mocked(acpAgentsApi.install).mockResolvedValue({
      ok: true,
      data: {
        managedBy: "fyllocode",
        installMethod: "npx",
        installedVersion: "1.2.3",
        installedAt: Date.now(),
      },
    });
    vi.mocked(acpAgentsApi.loadCapabilitiesCache).mockResolvedValue({
      ok: true,
      data: {
        "claude-code": { image: true, audio: false, embeddedContext: true },
      },
    });
    vi.mocked(acpAgentsApi.ensureAgent).mockResolvedValue({
      ok: true,
      data: {
        promptCapabilities: { image: false, audio: true, embeddedContext: false },
      },
    });
  });

  it("loads registry, icons and statuses through the ACP API", async () => {
    const store = useAcpAgentsStore();

    await store.loadRegistry();
    await store.loadIcons();
    await store.refreshStatus();

    expect(store.registry).toEqual(mockRegistry);
    expect(store.icons["claude-code"]).toContain("data:image/png");
    expect(store.statuses["claude-code"]).toEqual(mockStatuses[0]);
    expect(acpAgentsApi.onRegistryUpdated).toHaveBeenCalledTimes(1);
    expect(acpAgentsApi.onInstallProgress).toHaveBeenCalledTimes(1);
  });

  it("initializes ACP agent data only once when called concurrently", async () => {
    const store = useAcpAgentsStore();

    await Promise.all([store.ensureInitialized(), store.ensureInitialized()]);

    expect(acpAgentsApi.getRegistry).toHaveBeenCalledTimes(1);
    expect(acpAgentsApi.getIcons).toHaveBeenCalledTimes(1);
    expect(acpAgentsApi.detectStatus).toHaveBeenCalledTimes(1);
    expect(store.initialized).toBe(true);
    expect(store.initializing).toBe(false);
  });

  it("refreshes registry, icons and statuses through refreshAll", async () => {
    const store = useAcpAgentsStore();

    await store.refreshAll();

    expect(acpAgentsApi.refreshRegistry).toHaveBeenCalledTimes(1);
    expect(acpAgentsApi.getIcons).toHaveBeenCalledTimes(1);
    expect(acpAgentsApi.detectStatus).toHaveBeenCalledTimes(1);
    expect(store.registry).toEqual(mockRegistry);
    expect(store.statuses["claude-code"]).toEqual(mockStatuses[0]);
  });

  it("tracks initializationError and does not mark initialized on failure", async () => {
    vi.mocked(acpAgentsApi.getRegistry).mockRejectedValueOnce(new Error("network failed"));
    const store = useAcpAgentsStore();

    await expect(store.ensureInitialized()).rejects.toThrow("network failed");

    expect(store.initialized).toBe(false);
    expect(store.initializing).toBe(false);
    expect(store.initializationError).toBe("network failed");
  });

  it("marks install progress as done after a successful install", async () => {
    const store = useAcpAgentsStore();

    await store.installAgent("claude-code");

    expect(acpAgentsApi.install).toHaveBeenCalledWith("claude-code");
    expect(acpAgentsApi.detectStatus).toHaveBeenCalled();
    expect(store.installProgress["claude-code"]).toEqual({
      agentId: "claude-code",
      status: "done",
    });
  });

  it("resolves the preferred installed agent and falls back to the first installed one", async () => {
    const store = useAcpAgentsStore();

    await store.loadRegistry();
    await store.refreshStatus();

    expect(store.installedAgentIds).toEqual(["claude-code"]);
    expect(store.resolveInstalledAgent("claude-code")).toBe("claude-code");
    expect(store.resolveInstalledAgent("missing-agent")).toBe("claude-code");
    expect(store.resolveInstalledAgent(null)).toBe("claude-code");
  });

  it("loads prompt capabilities cache and returns default values for misses", async () => {
    const store = useAcpAgentsStore();

    expect(store.getPromptCapabilities("missing")).toEqual({
      image: false,
      audio: false,
      embeddedContext: false,
    });

    await store.loadCapabilitiesCache();

    expect(store.getPromptCapabilities("claude-code")).toEqual({
      image: true,
      audio: false,
      embeddedContext: true,
    });
  });

  it("refreshes prompt capabilities for an agent", async () => {
    const store = useAcpAgentsStore();

    await store.refreshCapabilities("claude-code");

    expect(acpAgentsApi.ensureAgent).toHaveBeenCalledWith("claude-code");
    expect(store.getPromptCapabilities("claude-code")).toEqual({
      image: false,
      audio: true,
      embeddedContext: false,
    });
  });

  it("clears in-memory prompt capabilities on agentUnavailable", async () => {
    const store = useAcpAgentsStore();

    await store.loadCapabilitiesCache();
    expect(store.getPromptCapabilities("claude-code").image).toBe(true);

    agentUnavailableListener?.({ agentId: "claude-code", reason: "crashed" });

    expect(store.getPromptCapabilities("claude-code")).toEqual({
      image: false,
      audio: false,
      embeddedContext: false,
    });
  });
});
