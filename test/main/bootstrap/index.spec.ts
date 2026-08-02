import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  whenReady: vi.fn(),
  setAppUserModelId: vi.fn(),
  syncShellPath: vi.fn(),
  runAllMigrations: vi.fn(),
  validateWorkspaceCutoverState: vi.fn(),
  showWorkspaceUpgradeFailure: vi.fn(),
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
    whenReady: mocks.whenReady,
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
  validateWorkspaceCutoverState: mocks.validateWorkspaceCutoverState,
  WORKSPACE_CUTOVER_MIGRATION_ID: "20260802_001_project-to-workspace",
}));
vi.mock("@main/bootstrap/workspace-upgrade-failure", () => ({
  showWorkspaceUpgradeFailure: mocks.showWorkspaceUpgradeFailure,
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
vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
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
    mocks.whenReady.mockResolvedValue(undefined);
    mocks.syncShellPath.mockResolvedValue(undefined);
    mocks.runAllMigrations.mockResolvedValue(undefined);
    mocks.validateWorkspaceCutoverState.mockResolvedValue({ ok: true, issues: [] });
    mocks.showWorkspaceUpgradeFailure.mockResolvedValue(undefined);
    mocks.initBuiltInWorkflows.mockReturnValue(new Promise<void>(() => undefined));
    mocks.focusLastActiveWindow.mockReturnValue(true);
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

  it("stops bootstrap at the required cutover gate and shows only native failure UI", async () => {
    mocks.validateWorkspaceCutoverState.mockResolvedValue({
      ok: false,
      status: { state: "failed" },
      issues: [{ type: "required-migration", message: "copy failed" }],
    });
    const onWindowReady = vi.fn();

    const { bootstrapReady } = await import("@main/bootstrap/index");
    await bootstrapReady(onWindowReady);

    expect(mocks.runAllMigrations).toHaveBeenCalledOnce();
    expect(mocks.validateWorkspaceCutoverState).toHaveBeenCalledOnce();
    expect(mocks.showWorkspaceUpgradeFailure).toHaveBeenCalledWith({
      migrationId: "20260802_001_project-to-workspace",
      reason: "copy failed",
    });
    expect(mocks.startBundledMcpHost).not.toHaveBeenCalled();
    expect(mocks.registerDisposable).not.toHaveBeenCalled();
    expect(mocks.registerAllHandlers).not.toHaveBeenCalled();
    expect(mocks.initBuiltInWorkflows).not.toHaveBeenCalled();
    expect(mocks.setupProbeBroadcast).not.toHaveBeenCalled();
    expect(mocks.setupAgentEventBroadcast).not.toHaveBeenCalled();
    expect(mocks.setupProposalStatusBroadcast).not.toHaveBeenCalled();
    expect(mocks.openLauncherWindow).not.toHaveBeenCalled();
    expect(mocks.scheduleInstalledAgentConnectionWarmup).not.toHaveBeenCalled();
    expect(onWindowReady).not.toHaveBeenCalled();
  });

  it("defers and coalesces window attention until the first window is ready", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    const controller = startApp();

    controller.requestWindowAttention();
    controller.requestWindowAttention();

    expect(mocks.focusLastActiveWindow).not.toHaveBeenCalled();
    expect(mocks.openLauncherWindow).not.toHaveBeenCalled();
    expect(mocks.scheduleInstalledAgentConnectionWarmup).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(mocks.openLauncherWindow).toHaveBeenCalledOnce());

    expect(mocks.runAllMigrations).toHaveBeenCalledOnce();
    expect(mocks.focusLastActiveWindow).toHaveBeenCalledOnce();
    expect(mocks.scheduleInstalledAgentConnectionWarmup).toHaveBeenCalledOnce();
    expect(mocks.openLauncherWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.focusLastActiveWindow.mock.invocationCallOrder[0]
    );
  });

  it("focuses the last active window after bootstrap is ready", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    const controller = startApp();

    await vi.waitFor(() => expect(mocks.openLauncherWindow).toHaveBeenCalledOnce());
    mocks.openLauncherWindow.mockClear();
    mocks.focusLastActiveWindow.mockClear();

    controller.requestWindowAttention();

    expect(mocks.focusLastActiveWindow).toHaveBeenCalledOnce();
    expect(mocks.openLauncherWindow).not.toHaveBeenCalled();
  });

  it("opens the launcher when no existing window can be focused", async () => {
    mocks.focusLastActiveWindow.mockReturnValue(false);
    const { startApp } = await import("@main/bootstrap/index");
    const controller = startApp();

    await vi.waitFor(() => expect(mocks.openLauncherWindow).toHaveBeenCalledOnce());
    mocks.openLauncherWindow.mockClear();
    mocks.focusLastActiveWindow.mockClear();

    controller.requestWindowAttention();

    expect(mocks.focusLastActiveWindow).toHaveBeenCalledOnce();
    expect(mocks.openLauncherWindow).toHaveBeenCalledOnce();
  });
});
