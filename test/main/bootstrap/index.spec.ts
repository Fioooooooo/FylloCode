import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  whenReady: vi.fn(),
  appQuit: vi.fn(),
  appExit: vi.fn(),
  setAppUserModelId: vi.fn(),
  watchWindowShortcuts: vi.fn(),
  createStartupWindowController: vi.fn(),
  startupFocus: vi.fn(),
  startupAbort: vi.fn(),
  syncShellPath: vi.fn(),
  startApplicationRuntime: vi.fn(),
  runtimeFocusOrOpen: vi.fn(),
  isShuttingDown: vi.fn(),
  attachEmergencyShutdown: vi.fn(),
  requestApplicationShutdown: vi.fn(),
  markLifecycleMetric: vi.fn(),
  markLifecycleMetricAt: vi.fn(),
  configureLifecycleMetrics: vi.fn(),
}));

let resolveReady!: () => void;
let resolveVisible!: (value: "loaded") => void;

vi.mock("electron", () => ({
  app: {
    on: mocks.appOn,
    whenReady: mocks.whenReady,
    quit: mocks.appQuit,
    exit: mocks.appExit,
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  electronApp: { setAppUserModelId: mocks.setAppUserModelId },
  optimizer: { watchWindowShortcuts: mocks.watchWindowShortcuts },
}));

vi.mock("@main/bootstrap/startup", () => ({
  createStartupWindowController: mocks.createStartupWindowController,
}));

vi.mock("@main/infra/process/sync-shell-path", () => ({
  syncShellPath: mocks.syncShellPath,
}));

vi.mock("@main/bootstrap/runtime", () => ({
  startApplicationRuntime: mocks.startApplicationRuntime,
}));

vi.mock("@main/bootstrap/lifecycle", () => ({
  isShuttingDown: mocks.isShuttingDown,
}));

vi.mock("@main/bootstrap/shutdown", () => ({
  attachEmergencyShutdown: mocks.attachEmergencyShutdown,
  requestApplicationShutdown: mocks.requestApplicationShutdown,
}));

vi.mock("@main/bootstrap/startup-metrics", () => ({
  configureLifecycleMetrics: mocks.configureLifecycleMetrics,
  markLifecycleMetric: mocks.markLifecycleMetric,
  markLifecycleMetricAt: mocks.markLifecycleMetricAt,
}));

vi.mock("@main/infra/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function appListener(name: string): (...args: unknown[]) => void {
  const call = mocks.appOn.mock.calls.find(([eventName]) => eventName === name);
  if (!call) throw new Error(`Missing app listener: ${name}`);
  return call[1];
}

describe("main bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.isShuttingDown.mockReturnValue(false);
    mocks.requestApplicationShutdown.mockImplementation(
      async ({ exit }: { exit(code: number): void }) => exit(0)
    );
    mocks.syncShellPath.mockResolvedValue(undefined);

    mocks.whenReady.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReady = resolve;
      })
    );
    const firstVisible = new Promise<"loaded">((resolve) => {
      resolveVisible = resolve;
    });
    mocks.createStartupWindowController.mockReturnValue({
      firstVisible,
      focus: mocks.startupFocus,
      isUsable: vi.fn(() => true),
      abort: mocks.startupAbort,
    });
    mocks.startupFocus.mockReturnValue(true);
    mocks.startApplicationRuntime.mockResolvedValue({
      focusOrOpenPrimaryWindow: mocks.runtimeFocusOrOpen,
    });
  });

  it("shows the startup shell before importing PATH/runtime work", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    startApp();
    resolveReady();

    await vi.waitFor(() => expect(mocks.createStartupWindowController).toHaveBeenCalledOnce());
    expect(mocks.syncShellPath).not.toHaveBeenCalled();
    expect(mocks.startApplicationRuntime).not.toHaveBeenCalled();

    resolveVisible("loaded");
    await vi.waitFor(() => expect(mocks.startApplicationRuntime).toHaveBeenCalledOnce());

    expect(mocks.syncShellPath).toHaveBeenCalledOnce();
    expect(mocks.startApplicationRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        getStartupWindow: expect.any(Function),
        shellPathReady: expect.any(Promise),
      })
    );
  });

  it("coalesces attention before app ready and focuses once the shell exists", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    const controller = startApp();

    controller.requestWindowAttention();
    controller.requestWindowAttention();
    expect(mocks.startupFocus).not.toHaveBeenCalled();

    resolveReady();
    resolveVisible("loaded");
    await vi.waitFor(() => expect(mocks.startupFocus).toHaveBeenCalledOnce());
  });

  it("focuses the visible startup shell for second-instance attention", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    const controller = startApp();
    resolveReady();
    await vi.waitFor(() => expect(mocks.createStartupWindowController).toHaveBeenCalledOnce());

    controller.requestWindowAttention();

    expect(mocks.startupFocus).toHaveBeenCalledOnce();
    expect(mocks.runtimeFocusOrOpen).not.toHaveBeenCalled();
  });

  it("recreates startup feedback on macOS activate after the startup window closes", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    startApp();
    resolveReady();
    await vi.waitFor(() => expect(mocks.createStartupWindowController).toHaveBeenCalledOnce());
    mocks.startupFocus.mockReturnValue(false);
    const firstController = mocks.createStartupWindowController.mock.results[0]?.value as {
      isUsable: ReturnType<typeof vi.fn>;
    };
    firstController.isUsable.mockReturnValue(false);

    appListener("activate")();

    expect(mocks.createStartupWindowController).toHaveBeenCalledTimes(2);
  });

  it("ignores attention and activate after the shutdown fence", async () => {
    mocks.isShuttingDown.mockReturnValue(true);
    const { startApp } = await import("@main/bootstrap/index");
    const controller = startApp();

    controller.requestWindowAttention();
    appListener("activate")();

    expect(mocks.startupFocus).not.toHaveBeenCalled();
    expect(mocks.runtimeFocusOrOpen).not.toHaveBeenCalled();
  });

  it("records entry timing supplied by the minimal main entry", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    startApp({ processEntryAt: 10, singleInstanceLockAt: 12 });

    expect(mocks.configureLifecycleMetrics).toHaveBeenCalledWith({ processEntryAt: 10 });
    expect(mocks.markLifecycleMetricAt).toHaveBeenNthCalledWith(1, "process-entry", 10);
    expect(mocks.markLifecycleMetricAt).toHaveBeenNthCalledWith(2, "single-instance-lock", 12);
  });

  it("delegates first quit to the shallow shutdown coordinator", async () => {
    const { startApp } = await import("@main/bootstrap/index");
    startApp();
    resolveReady();
    await vi.waitFor(() => expect(mocks.createStartupWindowController).toHaveBeenCalledOnce());
    const event = { preventDefault: vi.fn() };

    appListener("before-quit")(event);
    await vi.waitFor(() => expect(mocks.appExit).toHaveBeenCalledWith(0));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.requestApplicationShutdown).toHaveBeenCalledWith({
      startupWindow: expect.any(Object),
      exit: expect.any(Function),
    });
  });
});
