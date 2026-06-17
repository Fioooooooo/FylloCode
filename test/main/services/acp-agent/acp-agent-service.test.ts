import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-acp-agent-service-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  getOrStartProcess: vi.fn(),
}));

vi.mock("@main/infra/storage/agent-capability-store", () => ({
  getCachedPromptCapabilities: vi.fn(),
  removeAgentCapabilities: vi.fn(),
  removeCustomAgentCapabilities: vi.fn(),
}));

vi.mock("@main/infra/storage/acp-registry-cache", () => ({
  getRegistry: vi.fn(),
  refreshRegistry: vi.fn(),
}));

vi.mock("@main/infra/storage/custom-agent-config-store", () => ({
  readCustomAgents: vi.fn(),
  writeCustomAgents: vi.fn(),
}));

vi.mock("@main/infra/storage/acp-status-cache", () => ({
  readStatusCache: vi.fn(),
  writeStatusCache: vi.fn(),
}));

vi.mock("@main/infra/storage/acp-icon-cache", () => ({
  getAgentIcons: vi.fn(),
}));

vi.mock("@main/services/acp-agent/installer", () => ({
  installAgent: vi.fn(),
  uninstallAgent: vi.fn(),
}));

import { getOrStartProcess } from "@main/infra/process/acp-process-pool";
import { getCachedPromptCapabilities } from "@main/infra/storage/agent-capability-store";
import { readCustomAgents } from "@main/infra/storage/custom-agent-config-store";
import { ensureAgent } from "@main/services/acp-agent/acp-agent-service";
import { generateCustomAgentId } from "@main/infra/acp/agent-catalog-service";

const mockedGetOrStartProcess = vi.mocked(getOrStartProcess);
const mockedGetCachedPromptCapabilities = vi.mocked(getCachedPromptCapabilities);
const mockedReadCustomAgents = vi.mocked(readCustomAgents);

function getCustomAgentId(command: string, args: string[]): string {
  return generateCustomAgentId(command, args);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetOrStartProcess.mockResolvedValue(
    undefined as unknown as Awaited<ReturnType<typeof getOrStartProcess>>
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("ensureAgent custom branch", () => {
  it("throws AGENT_NOT_FOUND when custom agent is not configured", async () => {
    mockedReadCustomAgents.mockResolvedValue({ agent_servers: {} });

    await expect(ensureAgent("custom-missing-agent")).rejects.toMatchObject({
      code: "AGENT_NOT_FOUND",
    });
  });

  it("returns cached capabilities when cache hit with empty version", async () => {
    mockedReadCustomAgents.mockResolvedValue({
      agent_servers: {
        "Kimi Code CLI": { command: "/usr/local/bin/kimi", args: ["acp"] },
      },
    });
    mockedGetCachedPromptCapabilities.mockResolvedValue({
      capabilities: { image: true, audio: false, embeddedContext: false },
      capturedAgentVersion: "",
    });

    const agentId = getCustomAgentId("/usr/local/bin/kimi", ["acp"]);
    const result = await ensureAgent(agentId);

    expect(result.promptCapabilities).toEqual({
      image: true,
      audio: false,
      embeddedContext: false,
    });
    expect(mockedGetOrStartProcess).toHaveBeenCalledWith(agentId);
  });

  it("starts process and returns capabilities when cache miss", async () => {
    mockedReadCustomAgents.mockResolvedValue({
      agent_servers: {
        "Kimi Code CLI": { command: "/usr/local/bin/kimi", args: ["acp"] },
      },
    });
    mockedGetCachedPromptCapabilities.mockResolvedValue(null);

    const agentId = getCustomAgentId("/usr/local/bin/kimi", ["acp"]);
    mockedGetOrStartProcess.mockResolvedValue({
      initializeResponse: {
        agentCapabilities: {
          promptCapabilities: { image: false, audio: true, embeddedContext: true },
        },
      },
    } as unknown as Awaited<ReturnType<typeof getOrStartProcess>>);

    const result = await ensureAgent(agentId);

    expect(mockedGetOrStartProcess).toHaveBeenCalledWith(agentId);
    expect(result.promptCapabilities).toEqual({
      image: false,
      audio: true,
      embeddedContext: true,
    });
  });
});
