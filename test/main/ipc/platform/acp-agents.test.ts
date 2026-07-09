import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectWindowManager } from "@main/bootstrap/project-window-manager";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-acp-ipc-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

const acpEventMocks = vi.hoisted(() => ({
  serviceListeners: new Map<string, (payload: unknown) => void>(),
  agentUnavailableListener: null as ((payload: { agentId: string; reason: string }) => void) | null,
}));

vi.mock("@main/services/platform/acp-agent/acp-agent-service", () => ({
  detectAgentStatusesForced: vi.fn(),
  ensureAgent: vi.fn(),
  installAgentById: vi.fn(),
  listAgentIcons: vi.fn(),
  listAgentStatuses: vi.fn(),
  loadAgentRegistry: vi.fn(),
  reloadAgentRegistry: vi.fn(),
  saveCustomAgents: vi.fn(),
  uninstallAgentById: vi.fn(),
  onAgentServiceEvent: vi.fn((event: string, listener: (payload: unknown) => void) => {
    acpEventMocks.serviceListeners.set(event, listener);
    return vi.fn();
  }),
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  onAgentUnavailable: vi.fn((listener: (payload: { agentId: string; reason: string }) => void) => {
    acpEventMocks.agentUnavailableListener = listener;
    return vi.fn();
  }),
}));

vi.mock("@main/infra/storage/agent-capability-store", () => ({
  loadCache: vi.fn(),
}));

vi.mock("@main/infra/storage/custom-agent-config-store", () => ({
  readCustomAgents: vi.fn(),
}));

import { ipcMain } from "electron";
import { PlatformAcpAgentChannels as AcpAgentChannels } from "@shared/ipc/platform/acp-agents.channels";
import { saveCustomAgents } from "@main/services/platform/acp-agent/acp-agent-service";
import { registerAcpAgentHandlers, setupAgentEventBroadcast } from "@main/ipc/platform/acp-agents";

const mockedSaveCustomAgents = vi.mocked(saveCustomAgents);
const mockedIpcMainHandle = vi.mocked(ipcMain.handle);

describe("registerAcpAgentHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acpEventMocks.serviceListeners.clear();
    acpEventMocks.agentUnavailableListener = null;
    registerAcpAgentHandlers();
  });

  it("registers saveCustomAgents handler", () => {
    const call = mockedIpcMainHandle.mock.calls.find(
      ([channel]) => channel === AcpAgentChannels.saveCustomAgents
    );
    expect(call).toBeDefined();
  });

  it("saveCustomAgents handler validates and delegates to service", async () => {
    const call = mockedIpcMainHandle.mock.calls.find(
      ([channel]) => channel === AcpAgentChannels.saveCustomAgents
    );
    expect(call).toBeDefined();

    const handler = call![1] as (_event: unknown, input: unknown) => Promise<unknown>;
    const config = {
      agent_servers: {
        "Kimi Code CLI": { command: "/usr/local/bin/kimi", args: ["acp"], env: {} },
      },
    };

    mockedSaveCustomAgents.mockResolvedValue(undefined);

    await expect(handler({}, config)).resolves.toEqual({ ok: true, data: undefined });
    expect(mockedSaveCustomAgents).toHaveBeenCalledWith(config);
  });

  it("broadcasts global agent events to every active window through the manager", () => {
    const manager = {
      sendToAll: vi.fn(),
    } as unknown as ProjectWindowManager;

    setupAgentEventBroadcast(manager);

    acpEventMocks.serviceListeners.get("registryUpdated")?.({ agents: [] });
    acpEventMocks.agentUnavailableListener?.({ agentId: "codex", reason: "crashed" });

    expect(manager.sendToAll).toHaveBeenCalledWith(AcpAgentChannels.registryUpdated, {
      agents: [],
    });
    expect(manager.sendToAll).toHaveBeenCalledWith(AcpAgentChannels.agentUnavailable, {
      agentId: "codex",
      reason: "crashed",
    });
  });
});
