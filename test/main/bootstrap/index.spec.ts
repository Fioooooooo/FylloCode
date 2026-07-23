import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  setAppUserModelId: vi.fn(),
  syncShellPath: vi.fn(),
  runAllMigrations: vi.fn(),
  startBundledMcpHost: vi.fn(),
  stopBundledMcpHost: vi.fn(),
  registerDisposable: vi.fn(),
  registerAllHandlers: vi.fn(),
  initBuiltInWorkflows: vi.fn(),
  setupProbeBroadcast: vi.fn(),
  setupAgentEventBroadcast: vi.fn(),
  setupProposalStatusBroadcast: vi.fn(),
  openLauncherWindow: vi.fn(),
  focusLastActiveWindow: vi.fn(),
  scheduleInstalledAgentConnectionWarmup: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    on: mocks.appOn,
    getVersion: () => "0.0.0-test",
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  electronApp: { setAppUserModelId: mocks.setAppUserModelId },
  optimizer: { watchWindowShortcuts: vi.fn() },
  is: { dev: true },
}));

vi.mock("@main/infra/process/sync-shell-path", () => ({
  syncShellPath: mocks.syncShellPath,
}));
vi.mock("@main/migrations", () => ({
  runAllMigrations: mocks.runAllMigrations,
}));
vi.mock("@main/infra/mcp/bundled-mcp-host", () => ({
  startBundledMcpHost: mocks.startBundledMcpHost,
  stopBundledMcpHost: mocks.stopBundledMcpHost,
}));
vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: mocks.registerDisposable,
  disposeAll: vi.fn(),
}));
vi.mock("@main/ipc", () => ({
  registerAllHandlers: mocks.registerAllHandlers,
}));
vi.mock("@main/services/automation/workflow/built-in-loader", () => ({
  initBuiltInWorkflows: mocks.initBuiltInWorkflows,
}));
vi.mock("@main/services/platform/acp-agent/connection-warmup", () => ({
  scheduleInstalledAgentConnectionWarmup: mocks.scheduleInstalledAgentConnectionWarmup,
}));
vi.mock("@main/ipc/session/chat", () => ({
  setupProbeBroadcast: mocks.setupProbeBroadcast,
}));
vi.mock("@main/ipc/platform/acp-agents", () => ({
  setupAgentEventBroadcast: mocks.setupAgentEventBroadcast,
}));
vi.mock("@main/ipc/proposal/browser", () => ({
  setupProposalStatusBroadcast: mocks.setupProposalStatusBroadcast,
}));
vi.mock("@main/bootstrap/project-window-manager", () => ({
  projectWindowManager: {
    openLauncherWindow: mocks.openLauncherWindow,
    focusLastActiveWindow: mocks.focusLastActiveWindow,
  },
}));
vi.mock("@main/infra/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("main bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncShellPath.mockResolvedValue(undefined);
    mocks.runAllMigrations.mockResolvedValue(undefined);
    mocks.initBuiltInWorkflows.mockReturnValue(new Promise<void>(() => undefined));
  });

  it("starts the MCP host without waiting for backend readiness before opening the window", async () => {
    const callOrder: string[] = [];
    mocks.startBundledMcpHost.mockImplementation(() => {
      callOrder.push("start-host");
    });
    mocks.registerAllHandlers.mockImplementation(() => {
      callOrder.push("register-ipc");
    });
    mocks.openLauncherWindow.mockImplementation(() => {
      callOrder.push("open-window");
    });
    mocks.scheduleInstalledAgentConnectionWarmup.mockImplementation(() => {
      callOrder.push("schedule-warmup");
    });

    const { bootstrapReady } = await import("@main/bootstrap/index");
    await bootstrapReady();

    expect(callOrder).toEqual(["start-host", "register-ipc", "open-window", "schedule-warmup"]);
    expect(mocks.registerDisposable).toHaveBeenCalledWith({
      name: "bundled-mcp-host",
      dispose: mocks.stopBundledMcpHost,
    });
  });

  it("schedules warmup only after prerequisites, event setup, and the first window", async () => {
    const callOrder: string[] = [];
    mocks.syncShellPath.mockImplementation(async () => {
      callOrder.push("shell-path");
    });
    mocks.runAllMigrations.mockImplementation(async () => {
      callOrder.push("migrations");
    });
    mocks.startBundledMcpHost.mockImplementation(() => {
      callOrder.push("start-host");
    });
    mocks.registerAllHandlers.mockImplementation(() => {
      callOrder.push("register-ipc");
    });
    mocks.setupProbeBroadcast.mockImplementation(() => {
      callOrder.push("probe-events");
    });
    mocks.setupAgentEventBroadcast.mockImplementation(() => {
      callOrder.push("agent-events");
    });
    mocks.setupProposalStatusBroadcast.mockImplementation(() => {
      callOrder.push("proposal-events");
    });
    mocks.openLauncherWindow.mockImplementation(() => {
      callOrder.push("open-window");
    });
    mocks.scheduleInstalledAgentConnectionWarmup.mockImplementation(() => {
      callOrder.push("schedule-warmup");
    });

    const { bootstrapReady } = await import("@main/bootstrap/index");
    await bootstrapReady();

    expect(callOrder).toEqual([
      "shell-path",
      "migrations",
      "start-host",
      "register-ipc",
      "probe-events",
      "agent-events",
      "proposal-events",
      "open-window",
      "schedule-warmup",
    ]);
    expect(mocks.scheduleInstalledAgentConnectionWarmup).toHaveBeenCalledOnce();
  });
});
