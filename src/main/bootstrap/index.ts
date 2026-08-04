import { app } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { isShuttingDown } from "./lifecycle";
import {
  configureLifecycleMetrics,
  markLifecycleMetric,
  markLifecycleMetricAt,
} from "./startup-metrics";
import { createStartupWindowController, type StartupWindowController } from "./startup";
import { attachEmergencyShutdown, requestApplicationShutdown } from "./shutdown";

// Canonical 顺序：startup shell → required gate → runtime → renderer critical → background。
// 完整规则与退出资源清单见本目录 README.md。

export interface PrimaryInstanceController {
  requestWindowAttention(): void;
}

export interface StartAppOptions {
  processEntryAt?: number;
  singleInstanceLockAt?: number;
}

interface RuntimeController {
  focusOrOpenPrimaryWindow(): void;
}

let shuttingDown = false;
let startupWindow: StartupWindowController | null = null;
let runtimeController: RuntimeController | null = null;
let startupPromise: Promise<void> | null = null;
let applicationReady = false;

function replaceClosedStartupWindow(): boolean {
  if (!applicationReady || runtimeController || startupWindow?.isUsable()) return false;
  startupWindow = createStartupWindowController();
  return true;
}

async function runApplicationStartup(): Promise<void> {
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    startupWindow = createStartupWindowController();
    await startupWindow.firstVisible;

    if (isShuttingDown()) return;

    const shellPathReady = import("@main/infra/process/sync-shell-path")
      .then(({ syncShellPath }) => syncShellPath())
      .finally(() => markLifecycleMetric("shell-path-settled"));
    const runtimeModule = await import("./runtime");
    runtimeController = await runtimeModule.startApplicationRuntime({
      getStartupWindow: () => startupWindow,
      shellPathReady,
    });
  })();

  try {
    await startupPromise;
  } finally {
    startupPromise = null;
  }
}

function focusAvailableWindow(): boolean {
  if (startupWindow?.focus()) return true;
  if (runtimeController) {
    runtimeController.focusOrOpenPrimaryWindow();
    return true;
  }
  return false;
}

export function startApp(options: StartAppOptions = {}): PrimaryInstanceController {
  if (options.processEntryAt !== undefined) {
    configureLifecycleMetrics({ processEntryAt: options.processEntryAt });
    markLifecycleMetricAt("process-entry", options.processEntryAt);
    if (options.singleInstanceLockAt !== undefined) {
      markLifecycleMetricAt("single-instance-lock", options.singleInstanceLockAt);
    }
  }

  let hasPendingWindowAttention = false;
  const controller: PrimaryInstanceController = {
    requestWindowAttention(): void {
      if (isShuttingDown()) return;
      if (!focusAvailableWindow()) {
        hasPendingWindowAttention = true;
        replaceClosedStartupWindow();
      }
    },
  };

  void app.whenReady().then(async () => {
    applicationReady = true;
    markLifecycleMetric("app-ready");
    electronApp.setAppUserModelId("com.fyllocode.app");
    app.on("browser-window-created", (_event, window) => {
      optimizer.watchWindowShortcuts(window);
      attachEmergencyShutdown(window);
    });

    await runApplicationStartup();
    if (hasPendingWindowAttention && !isShuttingDown()) {
      hasPendingWindowAttention = false;
      focusAvailableWindow();
    }
  });

  app.on("activate", () => {
    if (isShuttingDown()) return;
    if (!focusAvailableWindow()) {
      hasPendingWindowAttention = true;
      if (!replaceClosedStartupWindow() && !startupPromise) void runApplicationStartup();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (event) => {
    if (shuttingDown) {
      event.preventDefault();
      return;
    }
    shuttingDown = true;
    event.preventDefault();
    void requestApplicationShutdown({
      startupWindow,
      exit: (code) => app.exit(code),
    });
  });

  return controller;
}
