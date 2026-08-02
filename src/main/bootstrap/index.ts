import { app, BrowserWindow } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerAllHandlers } from "@main/ipc";
import { setupAgentEventBroadcast } from "@main/ipc/platform/acp-agents";
import { setupProposalStatusBroadcast } from "@main/ipc/proposal/browser";
import { setupProbeBroadcast } from "@main/ipc/session/chat";
import { initBuiltInWorkflows } from "@main/services/automation/workflow/built-in-loader";
import { scheduleInstalledAgentConnectionWarmup } from "@main/services/platform/acp-agent/connection-warmup";
import { syncShellPath } from "@main/infra/process/sync-shell-path";
import { startBundledMcpHost, stopBundledMcpHost } from "@main/infra/mcp/bundled-mcp-host";
import {
  runAllMigrations,
  validateWorkspaceCutoverState,
  WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
} from "@main/migrations";
import { disposeAll, registerDisposable } from "./lifecycle";
import { workspaceWindowManager } from "./workspace-window-manager";
import { showWorkspaceUpgradeFailure } from "./workspace-upgrade-failure";
import logger from "@main/infra/logger";

let shuttingDown = false;

export interface PrimaryInstanceController {
  requestWindowAttention(): void;
}

export async function bootstrapReady(onWindowReady: () => void = () => undefined): Promise<void> {
  electronApp.setAppUserModelId("com.fyllocode.app");

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await syncShellPath();
  await runAllMigrations();
  const cutoverValidation = await validateWorkspaceCutoverState();
  if (!cutoverValidation.ok) {
    const reason = cutoverValidation.issues.map((issue) => issue.message).join("; ");
    logger.error(
      `[workspace-upgrade] required migration gate failed (${WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID}): ${reason}`
    );
    await showWorkspaceUpgradeFailure({
      migrationId: WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
      ...(reason ? { reason } : {}),
    });
    return;
  }

  logger.info(`FylloCode starting — v${app.getVersion()} [${is.dev ? "dev" : "prod"}]`);

  startBundledMcpHost();
  registerDisposable({
    name: "bundled-mcp-host",
    dispose: stopBundledMcpHost,
  });

  registerAllHandlers();
  void initBuiltInWorkflows();

  setupProbeBroadcast(workspaceWindowManager);
  setupAgentEventBroadcast(workspaceWindowManager);
  setupProposalStatusBroadcast(workspaceWindowManager);
  workspaceWindowManager.openLauncherWindow();
  onWindowReady();
  scheduleInstalledAgentConnectionWarmup();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      workspaceWindowManager.openLauncherWindow();
      return;
    }

    workspaceWindowManager.focusLastActiveWindow();
  });
}

export function startApp(): PrimaryInstanceController {
  let isWindowReady = false;
  let hasPendingWindowAttention = false;

  const focusOrOpenPrimaryWindow = (): void => {
    if (!workspaceWindowManager.focusLastActiveWindow()) {
      workspaceWindowManager.openLauncherWindow();
    }
  };

  const controller: PrimaryInstanceController = {
    requestWindowAttention(): void {
      if (!isWindowReady) {
        hasPendingWindowAttention = true;
        return;
      }

      focusOrOpenPrimaryWindow();
    },
  };

  app.whenReady().then(() =>
    bootstrapReady(() => {
      isWindowReady = true;

      if (hasPendingWindowAttention) {
        hasPendingWindowAttention = false;
        focusOrOpenPrimaryWindow();
      }
    })
  );

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

  return controller;
}
