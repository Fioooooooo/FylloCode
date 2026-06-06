import { app, BrowserWindow } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerAllHandlers } from "@main/ipc";
import { setupProbeBroadcast } from "@main/ipc/chat";
import { initBuiltInWorkflows } from "@main/services/workflow/built-in-loader";
import { syncShellPath } from "@main/infra/process/sync-shell-path";
import { runAllMigrations } from "@main/migrations";
import { disposeAll } from "./lifecycle";
import { createMainWindow } from "./window";
import logger from "@main/infra/logger";

let shuttingDown = false;

export function startApp(): void {
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.fyllocode.app");

    app.on("browser-window-created", (_event, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    await syncShellPath();
    await runAllMigrations();

    logger.info(`FylloCode starting — v${app.getVersion()} [${is.dev ? "dev" : "prod"}]`);

    registerAllHandlers();
    void initBuiltInWorkflows();

    setupProbeBroadcast(createMainWindow());

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) setupProbeBroadcast(createMainWindow());
    });
  });

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
