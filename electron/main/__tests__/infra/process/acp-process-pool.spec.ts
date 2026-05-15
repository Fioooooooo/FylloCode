import { beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "stream";

const mocks = vi.hoisted(() => {
  const initialize = vi.fn();

  return {
    initialize,
    child: undefined as unknown,
    spawn: vi.fn(),
    readInstalledRecords: vi.fn(),
    getRegistry: vi.fn(),
    registerDisposable: vi.fn(),
  };
});

vi.mock("child_process", () => ({
  spawn: mocks.spawn,
}));

vi.mock("@main/domain/acp/detector", () => ({
  readInstalledRecords: mocks.readInstalledRecords,
}));

vi.mock("@main/infra/storage/acp-registry-cache", () => ({
  getRegistry: mocks.getRegistry,
}));

vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: mocks.registerDisposable,
}));

vi.mock("@agentclientprotocol/sdk", () => ({
  PROTOCOL_VERSION: 1,
  ndJsonStream: vi.fn(() => ({ transport: true })),
  ClientSideConnection: vi.fn(function () {
    return {
      initialize: mocks.initialize,
      closeSession: vi.fn(),
    };
  }),
}));

describe("acp-process-pool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.child = {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: new PassThrough(),
      once: vi.fn(),
      on: vi.fn(),
      kill: vi.fn(),
      removeListener: vi.fn(),
      killed: false,
    };
    mocks.spawn.mockReturnValue(mocks.child);
    mocks.readInstalledRecords.mockResolvedValue({
      "claude-acp": { installPath: "/bin/claude", installMethod: "binary" },
    });
    mocks.getRegistry.mockResolvedValue({
      agents: [
        {
          id: "claude-acp",
          distribution: {},
        },
      ],
    });
  });

  it("retains initializeResponse on the returned live process entry", async () => {
    const initResponse = {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { resume: {} },
      },
    };
    mocks.initialize.mockResolvedValue(initResponse);

    const { getOrStartProcess } = await import("@main/infra/process/acp-process-pool");
    const entry = await getOrStartProcess("claude-acp");

    expect(entry.initializeResponse).toEqual(initResponse);
  });
});
