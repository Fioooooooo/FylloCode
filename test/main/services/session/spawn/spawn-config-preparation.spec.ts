import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";

const mocks = vi.hoisted(() => ({
  hasActiveAcpSession: vi.fn(),
  hasActiveMcpActivation: vi.fn(),
  activateAcpSession: vi.fn(),
  recoverSessionConfig: vi.fn(),
  createSpawnRuntimeProfile: vi.fn(),
  normalize: vi.fn((options: unknown[] | null | undefined) => options ?? []),
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  hasActiveAcpSession: mocks.hasActiveAcpSession,
  hasActiveMcpActivation: mocks.hasActiveMcpActivation,
}));
vi.mock("@main/services/session/chat/acp-session-activation", () => ({
  activateAcpSession: mocks.activateAcpSession,
}));
vi.mock("@main/services/session/chat/session-config-recovery-service", () => ({
  recoverSessionConfig: mocks.recoverSessionConfig,
}));
vi.mock("@main/services/session/chat/session-runtime-profile", () => ({
  createSpawnRuntimeProfile: mocks.createSpawnRuntimeProfile,
}));
vi.mock("@main/services/session/chat/acp-mapper", () => ({
  normalizeAcpSessionConfigOptions: mocks.normalize,
}));

import {
  prepareSpawnConfig,
  type SpawnConfigPreparationInput,
} from "@main/services/session/spawn/spawn-config-preparation";
import type { SpawnedAcpSessionStore } from "@main/services/session/spawn/spawn-acp-session-store";

function select(
  id: string,
  category: string,
  currentValue: string,
  values: string[]
): AcpSessionConfigOption {
  return {
    id,
    name: id,
    category,
    type: "select",
    currentValue,
    options: values.map((value) => ({ value, name: value })),
  };
}

function input(request: SpawnConfigPreparationInput["request"]): SpawnConfigPreparationInput {
  const sessionStore = {
    loadRecoveryState: vi.fn().mockResolvedValue({ acpSessionId: null, configOptions: [] }),
    persistPreparedSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as SpawnedAcpSessionStore;
  return {
    entry: {
      connection: { setSessionConfigOption: vi.fn() },
      initializeResponse: {},
    } as never,
    agentId: "agent-1",
    workspaceSnapshot: { cwd: "/tmp/project", additionalDirectories: [] } as never,
    sessionStore,
    request,
  };
}

describe("spawn-config-preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasActiveAcpSession.mockReturnValue(false);
    mocks.hasActiveMcpActivation.mockReturnValue(false);
    mocks.createSpawnRuntimeProfile.mockReturnValue({
      mcpServers: [],
      mcpActivationId: null,
      revoke: vi.fn(),
    });
    mocks.activateAcpSession.mockResolvedValue({
      sessionId: "acp-1",
      configOptions: [],
    });
    mocks.recoverSessionConfig.mockImplementation(
      ({ liveOptions }: { liveOptions?: AcpSessionConfigOption[] }) =>
        Promise.resolve(liveOptions ?? [])
    );
  });

  it("activates, applies model before dynamic thought level, and returns ready", async () => {
    const model = select("model", "model", "default", ["default", "o3"]);
    const thought = select("effort", "thought_level", "default", ["default", "high"]);
    const request = { model: "o3", thought_level: "high" };
    const prepared = input(request);
    const set = vi
      .fn()
      .mockResolvedValueOnce({
        configOptions: [
          { ...model, currentValue: "o3" },
          { ...thought, currentValue: "default" },
        ],
      })
      .mockResolvedValueOnce({
        configOptions: [
          { ...model, currentValue: "o3" },
          { ...thought, currentValue: "high" },
        ],
      });
    (
      prepared.entry.connection.setSessionConfigOption as ReturnType<typeof vi.fn>
    ).mockImplementation(set);
    mocks.activateAcpSession.mockResolvedValue({
      sessionId: "acp-1",
      configOptions: [model, thought],
    });
    mocks.recoverSessionConfig.mockResolvedValue([model, thought]);

    await expect(prepareSpawnConfig(prepared)).resolves.toMatchObject({
      status: "ready",
      acpSessionId: "acp-1",
      configOptions: [
        { id: "model", currentValue: "o3" },
        { id: "effort", currentValue: "high" },
      ],
    });
    expect(set.mock.calls).toEqual([
      [{ sessionId: "acp-1", configId: "model", value: "o3" }],
      [{ sessionId: "acp-1", configId: "effort", value: "high" }],
    ]);
  });

  it("returns a structured configuration_required result without setting an ambiguous model", async () => {
    const model: AcpSessionConfigOption = {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "openai/luna",
      options: [
        { value: "openai/luna", name: "Luna" },
        { value: "router/luna", name: "Luna" },
      ],
    };
    const prepared = input({ model: "luna" });
    mocks.activateAcpSession.mockResolvedValue({ sessionId: "acp-1", configOptions: [model] });
    mocks.recoverSessionConfig.mockResolvedValue([model]);

    await expect(prepareSpawnConfig(prepared)).resolves.toMatchObject({
      status: "configuration_required",
      acpSessionId: "acp-1",
      issues: [{ parameter: "model", reason: "ambiguous" }],
    });
    expect(prepared.entry.connection.setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("maps semantic set failures and incomplete snapshots to SPAWN_CONFIG_FAILED", async () => {
    const model = select("model", "model", "default", ["default", "o3"]);
    const prepared = input({ model: "o3" });
    mocks.activateAcpSession.mockResolvedValue({ sessionId: "acp-1", configOptions: [model] });
    mocks.recoverSessionConfig.mockResolvedValue([model]);
    (
      prepared.entry.connection.setSessionConfigOption as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("Agent rejected model"));

    await expect(prepareSpawnConfig(prepared)).rejects.toMatchObject({
      code: "SPAWN_CONFIG_FAILED",
      message: expect.stringContaining("Agent rejected model"),
    });

    const incomplete = input({ model: "o3" });
    mocks.activateAcpSession.mockResolvedValue({ sessionId: "acp-1", configOptions: [model] });
    mocks.recoverSessionConfig.mockResolvedValue([model]);
    (
      incomplete.entry.connection.setSessionConfigOption as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ configOptions: undefined });
    await expect(prepareSpawnConfig(incomplete)).rejects.toMatchObject({
      code: "SPAWN_CONFIG_FAILED",
      message: expect.stringContaining("complete configOptions snapshot"),
    });
  });
});
