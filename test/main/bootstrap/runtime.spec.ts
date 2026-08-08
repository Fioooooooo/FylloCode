import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appQuit: vi.fn(),
  showMessageBox: vi.fn(),
  registerAllHandlers: vi.fn(),
  setupAgentEventBroadcast: vi.fn(),
  setupProposalStatusBroadcast: vi.fn(),
  setupProbeBroadcast: vi.fn(),
  setupSpawnNotificationBroadcast: vi.fn(),
  startBundledMcpHost: vi.fn(),
  beginBundledMcpHostShutdown: vi.fn(),
  stopBundledMcpHost: vi.fn(),
  forceStopBundledMcpHost: vi.fn(),
  beginAcpProcessPoolShutdown: vi.fn(),
  disposeAcpProcessPool: vi.fn(),
  forceDisposeAcpProcessPool: vi.fn(),
  runAllMigrations: vi.fn(),
  validateWorkspaceCutoverState: vi.fn(),
  initBuiltInWorkflows: vi.fn(),
  isShuttingDown: vi.fn(),
  showWorkspaceUpgradeFailure: vi.fn(),
  reserveLauncherWindow: vi.fn(),
  activateLauncherContext: vi.fn(),
  focusLastActiveWindow: vi.fn(),
  openLauncherWindow: vi.fn(),
  markLifecycleMetric: vi.fn(),
  scheduleInitialAgentConnectionWarmup: vi.fn(),
  configureRendererReadiness: vi.fn(),
  beginRendererInteractiveFallback: vi.fn(),
  cancelRendererInteractiveFallback: vi.fn(),
  configureShutdownRuntimeResources: vi.fn(),
  disposeSessionProbes: vi.fn(),
  registerSpawnRpcBridge: vi.fn(),
  unregisterSpawnRpcBridge: vi.fn(),
  registerSpawnParentDeletionHandler: vi.fn(),
  unregisterSpawnParentDeletion: vi.fn(),
  beginSpawnShutdown: vi.fn(),
  startSpawnSessions: vi.fn(),
  disposeSpawnSessions: vi.fn(),
  forceDisposeSpawnSessions: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getVersion: () => "0.0.0-test", quit: mocks.appQuit },
  dialog: { showMessageBox: mocks.showMessageBox },
}));
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: true } }));
vi.mock("@main/ipc", () => ({ registerAllHandlers: mocks.registerAllHandlers }));
vi.mock("@main/ipc/platform/acp-agents", () => ({
  setupAgentEventBroadcast: mocks.setupAgentEventBroadcast,
}));
vi.mock("@main/ipc/proposal/browser", () => ({
  setupProposalStatusBroadcast: mocks.setupProposalStatusBroadcast,
}));
vi.mock("@main/ipc/session/chat", () => ({
  setupProbeBroadcast: mocks.setupProbeBroadcast,
  setupSpawnNotificationBroadcast: mocks.setupSpawnNotificationBroadcast,
}));
vi.mock("@main/infra/mcp/bundled-mcp-host", () => ({
  startBundledMcpHost: mocks.startBundledMcpHost,
  beginBundledMcpHostShutdown: mocks.beginBundledMcpHostShutdown,
  stopBundledMcpHost: mocks.stopBundledMcpHost,
  forceStopBundledMcpHost: mocks.forceStopBundledMcpHost,
}));
vi.mock("@main/infra/mcp/mcp-access-grant-registry", () => ({
  mcpAccessGrantRegistry: { revokeAll: vi.fn() },
}));
vi.mock("@main/infra/process/acp-process-pool", () => ({
  beginAcpProcessPoolShutdown: mocks.beginAcpProcessPoolShutdown,
  disposeAcpProcessPool: mocks.disposeAcpProcessPool,
  forceDisposeAcpProcessPool: mocks.forceDisposeAcpProcessPool,
}));
vi.mock("@main/infra/process/auxiliary-process-registry", () => ({
  beginAuxiliaryProcessShutdown: vi.fn(),
  disposeAuxiliaryProcesses: vi.fn(),
  forceDisposeAuxiliaryProcesses: vi.fn(),
}));
vi.mock("@main/migrations", () => ({
  runAllMigrations: mocks.runAllMigrations,
  validateWorkspaceCutoverState: mocks.validateWorkspaceCutoverState,
  WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID: "settlement-id",
}));
vi.mock("@main/services/automation/workflow/built-in-loader", () => ({
  initBuiltInWorkflows: mocks.initBuiltInWorkflows,
}));
vi.mock("@main/services/platform/acp-agent/connection-warmup", () => ({
  beginAgentConnectionWarmupShutdown: vi.fn(),
  scheduleInitialAgentConnectionWarmup: mocks.scheduleInitialAgentConnectionWarmup,
}));
vi.mock("@main/services/platform/acp-agent/installer", () => ({
  abortActiveAgentOperations: vi.fn(),
  awaitActiveAgentOperations: vi.fn(),
  forceAbortActiveAgentOperations: vi.fn(),
}));
vi.mock("@main/services/insight/lineage/mcp-event-consumer", () => ({
  disposeLineageEventConsumers: vi.fn(),
}));
vi.mock("@main/services/proposal/_public", () => ({
  proposalStatusService: { unwatchAll: vi.fn() },
}));
vi.mock("@main/services/session/chat/session-registry", () => ({
  disposeSessionRegistry: vi.fn(),
}));
vi.mock("@main/services/session/chat/session-probe-service", () => ({
  disposeSessionProbes: mocks.disposeSessionProbes,
}));
vi.mock("@main/services/session/spawn/spawn-rpc-bridge", () => ({
  registerSpawnRpcBridge: mocks.registerSpawnRpcBridge,
  unregisterSpawnRpcBridge: mocks.unregisterSpawnRpcBridge,
}));
vi.mock("@main/services/session/spawn/spawn-parent-lifecycle", () => ({
  registerSpawnParentDeletionHandler: mocks.registerSpawnParentDeletionHandler,
}));
vi.mock("@main/services/session/spawn/spawned-session-manager", () => ({
  spawnedSessionManager: {
    start: mocks.startSpawnSessions,
    beginShutdown: mocks.beginSpawnShutdown,
    dispose: mocks.disposeSpawnSessions,
    forceDispose: mocks.forceDisposeSpawnSessions,
    deleteParent: vi.fn(),
  },
}));
vi.mock("@main/services/platform/lifecycle/renderer-readiness", () => ({
  configureRendererReadiness: mocks.configureRendererReadiness,
  beginRendererInteractiveFallback: mocks.beginRendererInteractiveFallback,
  cancelRendererInteractiveFallback: mocks.cancelRendererInteractiveFallback,
}));
vi.mock("@main/bootstrap/lifecycle", () => ({ isShuttingDown: mocks.isShuttingDown }));
vi.mock("@main/bootstrap/startup-metrics", () => ({
  markLifecycleMetric: mocks.markLifecycleMetric,
}));
vi.mock("@main/bootstrap/shutdown", () => ({
  configureShutdownRuntimeResources: mocks.configureShutdownRuntimeResources,
}));
vi.mock("@main/bootstrap/workspace-upgrade-failure", () => ({
  showWorkspaceUpgradeFailure: mocks.showWorkspaceUpgradeFailure,
}));
vi.mock("@main/bootstrap/window", () => ({
  resolveFylloWindowLoadTarget: () => ({ kind: "url", value: "http://app/" }),
}));
vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    reserveLauncherWindow: mocks.reserveLauncherWindow,
    activateLauncherContext: mocks.activateLauncherContext,
    focusLastActiveWindow: mocks.focusLastActiveWindow,
    openLauncherWindow: mocks.openLauncherWindow,
    isActiveFormalRenderer: vi.fn(),
    getActiveFormalGeneration: vi.fn(() => 7),
    prepareForShutdown: vi.fn(),
  },
}));
vi.mock("@main/infra/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function createStartupWindow() {
  const window = new EventEmitter() as EventEmitter & {
    webContents: EventEmitter;
    isDestroyed: () => boolean;
  };
  window.webContents = new EventEmitter();
  window.isDestroyed = vi.fn(() => false);
  const startup = {
    window,
    isUsable: vi.fn(() => true),
    takeOwnership: vi.fn(() => ({
      token: {},
      stateController: { current: { role: "launcher" as const } },
    })),
    loadFormalRenderer: vi.fn(async () => {
      window.webContents.emit("did-navigate", {}, "http://app/");
    }),
    destroy: vi.fn(),
  };
  return startup;
}

describe("application runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.isShuttingDown.mockReturnValue(false);
    mocks.runAllMigrations.mockResolvedValue(undefined);
    mocks.validateWorkspaceCutoverState.mockResolvedValue({ ok: true, issues: [] });
    mocks.initBuiltInWorkflows.mockResolvedValue(undefined);
    mocks.reserveLauncherWindow.mockReturnValue(7);
    mocks.focusLastActiveWindow.mockReturnValue(true);
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    mocks.registerSpawnParentDeletionHandler.mockReturnValue(mocks.unregisterSpawnParentDeletion);
  });

  it("waits for gate and PATH before wiring, then activates the formal generation", async () => {
    const startup = createStartupWindow();
    let resolvePath!: () => void;
    const shellPathReady = new Promise<void>((resolve) => {
      resolvePath = resolve;
    });
    const { startApplicationRuntime } = await import("@main/bootstrap/runtime");
    const resultPromise = startApplicationRuntime({
      getStartupWindow: () => startup as never,
      shellPathReady,
    });

    await vi.waitFor(() => expect(mocks.validateWorkspaceCutoverState).toHaveBeenCalledOnce());
    expect(mocks.registerAllHandlers).not.toHaveBeenCalled();
    resolvePath();
    await expect(resultPromise).resolves.toBeTruthy();

    expect(mocks.registerAllHandlers).toHaveBeenCalledOnce();
    expect(mocks.reserveLauncherWindow).toHaveBeenCalledWith(startup.window, expect.any(Object));
    expect(mocks.activateLauncherContext).toHaveBeenCalledWith(startup.window, 7);
    expect(mocks.startBundledMcpHost).toHaveBeenCalledOnce();
    expect(mocks.registerSpawnRpcBridge).toHaveBeenCalledOnce();
    expect(mocks.startSpawnSessions).toHaveBeenCalledOnce();
    expect(mocks.registerSpawnParentDeletionHandler).toHaveBeenCalledOnce();
    expect(mocks.scheduleInitialAgentConnectionWarmup).not.toHaveBeenCalled();
  });

  it("destroys the startup shell before showing required-gate failure UI", async () => {
    mocks.validateWorkspaceCutoverState.mockResolvedValue({
      ok: false,
      issues: [{ message: "copy failed" }],
    });
    const startup = createStartupWindow();
    const { startApplicationRuntime } = await import("@main/bootstrap/runtime");

    await startApplicationRuntime({
      getStartupWindow: () => startup as never,
      shellPathReady: Promise.resolve(),
    });

    expect(startup.destroy).toHaveBeenCalledOnce();
    expect(mocks.showWorkspaceUpgradeFailure).toHaveBeenCalledWith({
      migrationId: "settlement-id",
      reason: "copy failed",
    });
    expect(mocks.registerAllHandlers).not.toHaveBeenCalled();
    expect(mocks.startBundledMcpHost).not.toHaveBeenCalled();
  });

  it("exposes an in-flight protected migration and skips late runtime handoff after shutdown", async () => {
    let settleMigration!: () => void;
    const migration = new Promise<void>((resolve) => {
      settleMigration = resolve;
    });
    mocks.runAllMigrations.mockReturnValue(migration);
    const startup = createStartupWindow();
    const { startApplicationRuntime } = await import("@main/bootstrap/runtime");
    const result = startApplicationRuntime({
      getStartupWindow: () => startup as never,
      shellPathReady: Promise.resolve(),
    });

    await vi.waitFor(() => expect(mocks.configureShutdownRuntimeResources).toHaveBeenCalledOnce());
    const resources = mocks.configureShutdownRuntimeResources.mock.calls[0]?.[0] as {
      getProtectedMutation(): Promise<void> | null;
    };
    await vi.waitFor(() => expect(resources.getProtectedMutation()).toBe(migration));
    mocks.isShuttingDown.mockReturnValue(true);
    settleMigration();

    await expect(result).resolves.toBeNull();
    expect(mocks.validateWorkspaceCutoverState).not.toHaveBeenCalled();
    expect(mocks.registerAllHandlers).not.toHaveBeenCalled();
    expect(mocks.startBundledMcpHost).not.toHaveBeenCalled();
  });

  it("shows a native failure and exits when the formal renderer fails to load", async () => {
    const startup = createStartupWindow();
    startup.loadFormalRenderer.mockRejectedValue(new Error("load failed"));
    const { startApplicationRuntime } = await import("@main/bootstrap/runtime");

    await startApplicationRuntime({
      getStartupWindow: () => startup as never,
      shellPathReady: Promise.resolve(),
    });

    expect(startup.destroy).toHaveBeenCalledOnce();
    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: "FylloCode 启动失败" })
    );
    expect(mocks.appQuit).toHaveBeenCalledOnce();
  });

  it("aborts and safely settles in-flight built-in workflow initialization", async () => {
    let signal: AbortSignal | undefined;
    let settleWorkflow!: () => void;
    const workflow = new Promise<void>((resolve) => {
      settleWorkflow = resolve;
    });
    mocks.initBuiltInWorkflows.mockImplementation((nextSignal: AbortSignal) => {
      signal = nextSignal;
      return workflow;
    });
    const startup = createStartupWindow();
    const { startApplicationRuntime } = await import("@main/bootstrap/runtime");
    await startApplicationRuntime({
      getStartupWindow: () => startup as never,
      shellPathReady: Promise.resolve(),
    });
    const resources = mocks.configureShutdownRuntimeResources.mock.calls[0]?.[0] as {
      abortAndAwaitWorkflowInitialization(): Promise<void>;
    };

    const settling = resources.abortAndAwaitWorkflowInitialization();
    expect(signal?.aborted).toBe(true);
    let settled = false;
    void settling.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    settleWorkflow();
    await settling;
    expect(settled).toBe(true);
  });
});
