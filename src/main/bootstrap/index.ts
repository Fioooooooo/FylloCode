import { app, BrowserWindow } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerAllHandlers } from "@main/ipc";
import { setupAgentEventBroadcast } from "@main/ipc/platform/acp-agents";
import { setupProposalStatusBroadcast } from "@main/ipc/proposal/browser";
import { setupProbeBroadcast } from "@main/ipc/session/chat";
import { initBuiltInWorkflows } from "@main/services/automation/workflow/built-in-loader";
import { syncShellPath } from "@main/infra/process/sync-shell-path";
import { startBundledMcpHost, stopBundledMcpHost } from "@main/infra/mcp/bundled-mcp-host";
import { runAllMigrations } from "@main/migrations";
import { disposeAll, registerDisposable } from "./lifecycle";
import { projectWindowManager } from "./project-window-manager";
import logger from "@main/infra/logger";

let shuttingDown = false;

export async function bootstrapReady(): Promise<void> {
  electronApp.setAppUserModelId("com.fyllocode.app");

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await syncShellPath();
  await runAllMigrations();

  logger.info(`FylloCode starting — v${app.getVersion()} [${is.dev ? "dev" : "prod"}]`);

  startBundledMcpHost();
  registerDisposable({
    name: "bundled-mcp-host",
    dispose: stopBundledMcpHost,
  });

  registerAllHandlers();
  void initBuiltInWorkflows();

  setupProbeBroadcast(projectWindowManager);
  setupAgentEventBroadcast(projectWindowManager);
  setupProposalStatusBroadcast(projectWindowManager);
  projectWindowManager.openLauncherWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      projectWindowManager.openLauncherWindow();
      return;
    }

    projectWindowManager.focusLastActiveWindow();
  });
}

export function startApp(): void {
  app.whenReady().then(bootstrapReady);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // Graceful shutdown: intercept the first before-quit, release disposables,
  // then call `app.exit()` so the second quit goes through unimpeded.
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();

    logger.info("[bootstrap] shutting down, releasing resources…");
    void disposeAll().finally(() => {
      logger.info("[bootstrap] shutdown complete");
      app.exit(0);
    });
  });
}
