import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetLifecycleForTests } from "@main/bootstrap/lifecycle";
import {
  attachEmergencyShutdown,
  configureShutdownRuntimeResources,
  requestApplicationShutdown,
  resetShutdownForTests,
  type ShutdownRuntimeResources,
} from "@main/bootstrap/shutdown";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  markLifecycleMetric: vi.fn(),
}));

vi.mock("@main/infra/logger", () => ({
  default: { info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@main/bootstrap/startup-metrics", () => ({
  markLifecycleMetric: mocks.markLifecycleMetric,
}));

function createResources(
  overrides: Partial<ShutdownRuntimeResources> = {}
): ShutdownRuntimeResources {
  return {
    getProtectedMutation: vi.fn(() => null),
    snapshotAndHide: vi.fn(),
    cancelRendererFallback: vi.fn(),
    beginWarmupShutdown: vi.fn(),
    disposeSessions: vi.fn(),
    disposeSessionProbes: vi.fn(async () => undefined),
    unwatchProposals: vi.fn(),
    disposeLineage: vi.fn(),
    revokeMcpGrants: vi.fn(),
    abortInstallerOperations: vi.fn(),
    awaitInstallerOperations: vi.fn(async () => undefined),
    forceAbortInstallerOperations: vi.fn(),
    abortAndAwaitWorkflowInitialization: vi.fn(async () => undefined),
    beginSpawnShutdown: vi.fn(),
    disposeSpawnSessions: vi.fn(async () => undefined),
    forceDisposeSpawnSessions: vi.fn(),
    beginAcpProcessPoolShutdown: vi.fn(),
    disposeAcpProcessPool: vi.fn(async () => undefined),
    forceDisposeAcpProcessPool: vi.fn(),
    beginMcpHostShutdown: vi.fn(),
    stopBundledMcpHost: vi.fn(async () => undefined),
    forceStopBundledMcpHost: vi.fn(),
    beginAuxiliaryProcessShutdown: vi.fn(),
    disposeAuxiliaryProcesses: vi.fn(async () => undefined),
    forceDisposeAuxiliaryProcesses: vi.fn(),
    ...overrides,
  };
}

function createWindow() {
  const window = new EventEmitter() as EventEmitter & {
    hide: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
  };
  window.hide = vi.fn();
  window.isDestroyed = vi.fn(() => false);
  return window;
}

beforeEach(() => {
  resetLifecycleForTests();
  resetShutdownForTests();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("application shutdown coordinator", () => {
  it("hides immediately, waits for a protected mutation, then terminates ACP and MCP in parallel", async () => {
    let settleMigration!: () => void;
    const migration = new Promise<void>((resolve) => {
      settleMigration = resolve;
    });
    let settleAcp!: () => void;
    const acp = new Promise<void>((resolve) => {
      settleAcp = resolve;
    });
    let settleMcp!: () => void;
    const mcp = new Promise<void>((resolve) => {
      settleMcp = resolve;
    });
    const resources = createResources({
      getProtectedMutation: vi.fn(() => migration),
      disposeAcpProcessPool: vi.fn(() => acp),
      stopBundledMcpHost: vi.fn(() => mcp),
    });
    configureShutdownRuntimeResources(resources);
    const exit = vi.fn();

    const result = requestApplicationShutdown({ startupWindow: null, exit });
    expect(resources.snapshotAndHide).toHaveBeenCalledOnce();
    expect(resources.beginWarmupShutdown).not.toHaveBeenCalled();

    settleMigration();
    await vi.waitFor(() => expect(resources.disposeAcpProcessPool).toHaveBeenCalledOnce());
    expect(resources.beginSpawnShutdown).toHaveBeenCalledOnce();
    expect(resources.disposeSpawnSessions).toHaveBeenCalledOnce();
    expect(vi.mocked(resources.disposeSpawnSessions).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(resources.disposeAcpProcessPool).mock.invocationCallOrder[0] ?? 0
    );
    expect(resources.disposeSessionProbes).toHaveBeenCalledOnce();
    expect(vi.mocked(resources.disposeSessionProbes).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(resources.beginAcpProcessPoolShutdown).mock.invocationCallOrder[0] ?? 0
    );
    expect(resources.stopBundledMcpHost).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();

    settleAcp();
    settleMcp();
    await result;
    expect(exit).toHaveBeenCalledWith(0);
    expect(
      mocks.markLifecycleMetric.mock.calls
        .map(([phase]) => phase)
        .filter((phase) => String(phase).startsWith("shutdown-"))
    ).toEqual([
      "shutdown-requested",
      "shutdown-waiting-protected-migration",
      "shutdown-snapshot-and-hide",
      "shutdown-quiesce",
      "shutdown-terminate",
      "shutdown-finalize",
      "shutdown-complete",
    ]);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('"name":"acp-process-pool"')
    );
  });

  it("coalesces repeated quit requests", async () => {
    const resources = createResources();
    configureShutdownRuntimeResources(resources);
    const exit = vi.fn();

    const first = requestApplicationShutdown({ startupWindow: null, exit });
    const second = requestApplicationShutdown({ startupWindow: null, exit });
    await Promise.all([first, second]);

    expect(resources.snapshotAndHide).toHaveBeenCalledOnce();
    expect(resources.disposeAcpProcessPool).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("uses one non-awaiting emergency path across duplicate multi-window session events", () => {
    const resources = createResources();
    configureShutdownRuntimeResources(resources);
    const firstWindow = createWindow();
    const secondWindow = createWindow();
    attachEmergencyShutdown(firstWindow as never);
    attachEmergencyShutdown(secondWindow as never);

    firstWindow.emit("query-session-end", {});
    secondWindow.emit("session-end", {});

    expect(firstWindow.hide).toHaveBeenCalledOnce();
    expect(secondWindow.hide).toHaveBeenCalledOnce();
    expect(resources.revokeMcpGrants).toHaveBeenCalledOnce();
    expect(resources.forceAbortInstallerOperations).toHaveBeenCalledOnce();
    expect(resources.forceDisposeSpawnSessions).toHaveBeenCalledOnce();
    expect(resources.forceDisposeAcpProcessPool).toHaveBeenCalledOnce();
    expect(resources.forceStopBundledMcpHost).toHaveBeenCalledOnce();
  });

  it("forces both child-process owners and exits at the absolute deadline", async () => {
    vi.useFakeTimers();
    const resources = createResources({
      disposeAcpProcessPool: vi.fn(() => new Promise<void>(() => undefined)),
      stopBundledMcpHost: vi.fn(() => new Promise<void>(() => undefined)),
    });
    configureShutdownRuntimeResources(resources);
    const exit = vi.fn();
    const result = requestApplicationShutdown({ startupWindow: null, exit });

    await vi.advanceTimersByTimeAsync(3_500);
    expect(resources.forceDisposeAcpProcessPool).toHaveBeenCalledOnce();
    expect(resources.forceStopBundledMcpHost).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    await result;
    expect(exit).toHaveBeenCalledWith(0);
  });
});
