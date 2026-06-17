import { beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-acp-ipc-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/services/acp-agent/acp-agent-service", () => ({
  detectAgentStatusesForced: vi.fn(),
  ensureAgent: vi.fn(),
  installAgentById: vi.fn(),
  listAgentIcons: vi.fn(),
  listAgentStatuses: vi.fn(),
  loadAgentRegistry: vi.fn(),
  reloadAgentRegistry: vi.fn(),
  saveCustomAgents: vi.fn(),
  uninstallAgentById: vi.fn(),
  onAgentServiceEvent: vi.fn(() => () => undefined),
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  onAgentUnavailable: vi.fn(() => () => undefined),
}));

vi.mock("@main/infra/storage/agent-capability-store", () => ({
  loadCache: vi.fn(),
}));

vi.mock("@main/infra/storage/custom-agent-config-store", () => ({
  readCustomAgents: vi.fn(),
}));

import { ipcMain } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import { saveCustomAgents } from "@main/services/acp-agent/acp-agent-service";
import { registerAcpAgentHandlers } from "@main/ipc/acp-agents";

const mockedSaveCustomAgents = vi.mocked(saveCustomAgents);
const mockedIpcMainHandle = vi.mocked(ipcMain.handle);

describe("registerAcpAgentHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
