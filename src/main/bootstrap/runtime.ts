import { app, dialog, type WebContents } from "electron";
import { pathToFileURL } from "node:url";
import { is } from "@electron-toolkit/utils";
import { registerAllHandlers } from "@main/ipc";
import { setupWorkflowProposalDecisionBroadcast } from "@main/ipc/automation/workflow-proposal-decision";
import { setupWorkflowProposalBroadcast } from "@main/ipc/automation/workflow-proposal";
import { setupWorkflowRunBroadcast } from "@main/ipc/automation/workflow-run";
import { setupAgentEventBroadcast } from "@main/ipc/platform/acp-agents";
import { setupProposalStatusBroadcast } from "@main/ipc/proposal/browser";
import { setupProbeBroadcast, setupSpawnNotificationBroadcast } from "@main/ipc/session/chat";
import { setupSpawnedSessionViewBroadcast } from "@main/ipc/session/spawned-session";
import {
  beginBundledMcpHostShutdown,
  forceStopBundledMcpHost,
  startBundledMcpHost,
  stopBundledMcpHost,
  waitForBundledMcpInitialReadiness,
} from "@main/infra/mcp/bundled-mcp-host";
import { mcpAccessGrantRegistry } from "@main/infra/mcp/mcp-access-grant-registry";
import {
  beginAcpProcessPoolShutdown,
  disposeAcpProcessPool,
  forceDisposeAcpProcessPool,
} from "@main/infra/process/acp-process-pool";
import {
  beginAuxiliaryProcessShutdown,
  disposeAuxiliaryProcesses,
  forceDisposeAuxiliaryProcesses,
} from "@main/infra/process/auxiliary-process-registry";
import logger from "@main/infra/logger";
import {
  runAllMigrations,
  validateWorkspaceCutoverState,
  WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
} from "@main/migrations";
import {
  beginAgentConnectionWarmupShutdown,
  scheduleInitialAgentConnectionWarmup,
} from "@main/services/platform/acp-agent/connection-warmup";
import {
  abortActiveAgentOperations,
  awaitActiveAgentOperations,
  forceAbortActiveAgentOperations,
} from "@main/services/platform/acp-agent/installer";
import { disposeLineageEventConsumers } from "@main/services/insight/lineage/mcp-event-consumer";
import {
  workflowActionRunner,
  workflowAgentRunner,
  workflowDecisionService,
  workflowEngine,
} from "@main/services/automation/_public";
import { workflowProposalService } from "@main/services/automation/workflow/workflow-proposal-service";
import { sendWorkflowConfirmHandoff } from "@main/services/session/chat/chat-turn-service";
import { proposalStatusService } from "@main/services/proposal/_public";
import { disposeSessionRegistry } from "@main/services/session/chat/session-registry";
import { disposeSessionProbes } from "@main/services/session/chat/session-probe-service";
import {
  registerSpawnRpcBridge,
  unregisterSpawnRpcBridge,
} from "@main/services/session/spawn/spawn-rpc-bridge";
import { spawnedSessionManager } from "@main/services/session/spawn/spawned-session-manager";
import { registerSpawnParentDeletionHandler } from "@main/services/session/spawn/spawn-parent-lifecycle";
import {
  registerWorkflowRpcBridge,
  unregisterWorkflowRpcBridge,
} from "@main/services/automation/workflow/workflow-rpc-bridge";
import { listWorkspaceIds } from "@main/services/workspace/_public";
import {
  beginRendererInteractiveFallback,
  cancelRendererInteractiveFallback,
  configureRendererReadiness,
} from "@main/services/platform/lifecycle/renderer-readiness";
import { isShuttingDown } from "./lifecycle";
import { markLifecycleMetric } from "./startup-metrics";
import { configureShutdownRuntimeResources } from "./shutdown";
import type { StartupWindowController } from "./startup";
import { resolveFylloWindowLoadTarget } from "./window";
import { showWorkspaceUpgradeFailure } from "./workspace-upgrade-failure";
import { workspaceWindowManager } from "./workspace-window-manager";

export interface RuntimeController {
  focusOrOpenPrimaryWindow(): void;
}

interface StartApplicationRuntimeOptions {
  getStartupWindow(): StartupWindowController | null;
  shellPathReady: Promise<void>;
}

let protectedMigration: Promise<void> | null = null;
let unregisterSpawnParentDeletion: (() => void) | null = null;
let disposeWorkflowRunBroadcast: (() => void) | null = null;
let disposeWorkflowProposalBroadcast: (() => void) | null = null;
let disposeWorkflowProposalDecisionBroadcast: (() => void) | null = null;

export function getProtectedMigration(): Promise<void> | null {
  return protectedMigration;
}

function formalRendererUrl(): string {
  const target = resolveFylloWindowLoadTarget("index");
  return target.kind === "url"
    ? new URL(target.value).toString()
    : pathToFileURL(target.value).toString();
}

function isExpectedFormalRendererUrl(url: string): boolean {
  try {
    return new URL(url).toString() === formalRendererUrl();
  } catch {
    return false;
  }
}

async function showFormalRendererFailure(): Promise<void> {
  await dialog.showMessageBox({
    type: "error",
    title: "FylloCode 启动失败",
    message: "FylloCode 无法加载应用界面",
    detail: "请重新启动 FylloCode；如果问题持续存在，请查看应用日志。",
    buttons: ["退出 FylloCode"],
    noLink: true,
  });
  app.quit();
}

async function runRequiredGate(
  getStartupWindow: () => StartupWindowController | null
): Promise<boolean> {
  protectedMigration = runAllMigrations();
  try {
    await protectedMigration;
    markLifecycleMetric("migration-settled");
  } finally {
    protectedMigration = null;
  }

  if (isShuttingDown()) return false;

  const validation = await validateWorkspaceCutoverState();
  markLifecycleMetric("cutover-validated", validation.ok ? "ok" : "failed");
  if (validation.ok) return true;

  const reason = validation.issues.map((issue) => issue.message).join("; ");
  logger.error(
    `[workspace-upgrade] required migration gate failed (${WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID}): ${reason}`
  );
  getStartupWindow()?.destroy();
  await showWorkspaceUpgradeFailure({
    migrationId: WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
    ...(reason ? { reason } : {}),
  });
  return false;
}

async function activateFormalRenderer(
  startupWindow: StartupWindowController,
  generation: number
): Promise<void> {
  const window = startupWindow.window;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      window.webContents.removeListener("did-navigate", handleNavigate);
      window.webContents.removeListener("did-fail-load", handleFailure);
      window.removeListener("closed", handleClosed);
    };
    const handleNavigate = (_event: Electron.Event, url: string): void => {
      if (!isExpectedFormalRendererUrl(url)) return;
      try {
        workspaceWindowManager.activateLauncherContext(window, generation);
        markLifecycleMetric("formal-renderer-loaded");
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const handleFailure = (
      _event: Electron.Event,
      _errorCode: number,
      errorDescription: string,
      validatedUrl: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame || !isExpectedFormalRendererUrl(validatedUrl)) return;
      cleanup();
      reject(new Error(errorDescription));
    };
    const handleClosed = (): void => {
      cleanup();
      reject(new Error("Formal renderer window closed during navigation"));
    };

    window.webContents.on("did-navigate", handleNavigate);
    window.webContents.on("did-fail-load", handleFailure);
    window.once("closed", handleClosed);
    void startupWindow.loadFormalRenderer().catch((error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function bindRendererReadiness(
  window: StartupWindowController["window"],
  generation: number
): void {
  const webContents = window.webContents;
  webContents.on("did-finish-load", () => {
    beginRendererInteractiveFallback(webContents, generation);
  });
  webContents.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) cancelRendererInteractiveFallback(webContents);
  });
  window.once("closed", () => cancelRendererInteractiveFallback(webContents));
}

function createRuntimeController(): RuntimeController {
  return {
    focusOrOpenPrimaryWindow(): void {
      if (!workspaceWindowManager.focusLastActiveWindow()) {
        workspaceWindowManager.openLauncherWindow();
      }
    },
  };
}

function scheduleWorkflowReconcile(): void {
  void waitForBundledMcpInitialReadiness()
    .then(async () => {
      if (isShuttingDown()) return;
      const workspaceIds = await listWorkspaceIds();
      if (isShuttingDown()) return;
      await workflowEngine.reconcileWorkspaces(workspaceIds);
      await Promise.all(
        workspaceIds.map((workspaceId) => workflowDecisionService.reconcileWorkspace(workspaceId))
      );
    })
    .catch((error: unknown) => {
      logger.error("[bootstrap] workflow reconcile failed", error);
    });
}

export async function startApplicationRuntime(
  options: StartApplicationRuntimeOptions
): Promise<RuntimeController | null> {
  configureShutdownRuntimeResources({
    getProtectedMutation: getProtectedMigration,
    snapshotAndHide: () => prepareRuntimeWindowsForShutdown(options.getStartupWindow()),
    cancelRendererFallback: () => cancelRendererInteractiveFallback(),
    beginWarmupShutdown: beginAgentConnectionWarmupShutdown,
    disposeSessions: disposeSessionRegistry,
    disposeSessionProbes,
    unwatchProposals: () => proposalStatusService.unwatchAll(),
    disposeLineage: disposeLineageEventConsumers,
    revokeMcpGrants: () => mcpAccessGrantRegistry.revokeAll("application-shutdown"),
    abortInstallerOperations: abortActiveAgentOperations,
    awaitInstallerOperations: awaitActiveAgentOperations,
    forceAbortInstallerOperations: forceAbortActiveAgentOperations,
    beginAcpProcessPoolShutdown,
    disposeAcpProcessPool,
    forceDisposeAcpProcessPool,
    beginSpawnShutdown: () => {
      unregisterSpawnRpcBridge();
      unregisterSpawnParentDeletion?.();
      unregisterSpawnParentDeletion = null;
      spawnedSessionManager.beginShutdown();
    },
    disposeSpawnSessions: () => spawnedSessionManager.dispose(),
    forceDisposeSpawnSessions: () => spawnedSessionManager.forceDispose(),
    beginWorkflowEngineShutdown: () => {
      workflowEngine.beginShutdown();
      workflowDecisionService.beginShutdown();
      unregisterWorkflowRpcBridge();
      disposeWorkflowRunBroadcast?.();
      disposeWorkflowRunBroadcast = null;
      disposeWorkflowProposalBroadcast?.();
      disposeWorkflowProposalBroadcast = null;
      disposeWorkflowProposalDecisionBroadcast?.();
      disposeWorkflowProposalDecisionBroadcast = null;
      workflowProposalService.setConfirmHandoffHandler(null);
    },
    disposeWorkflowEngine: () => workflowEngine.dispose(),
    forceDisposeWorkflowEngine: () => workflowEngine.forceDispose(),
    beginMcpHostShutdown: beginBundledMcpHostShutdown,
    stopBundledMcpHost,
    forceStopBundledMcpHost,
    beginAuxiliaryProcessShutdown,
    disposeAuxiliaryProcesses,
    forceDisposeAuxiliaryProcesses,
  });
  if (isShuttingDown()) return null;

  const gatePromise = runRequiredGate(options.getStartupWindow);
  const [gatePassed] = await Promise.all([gatePromise, options.shellPathReady]);
  if (!gatePassed || isShuttingDown()) return null;

  logger.info(`FylloCode starting — v${app.getVersion()} [${is.dev ? "dev" : "prod"}]`);
  configureRendererReadiness({
    getFormalGeneration: (webContents) =>
      workspaceWindowManager.getActiveFormalGeneration(webContents),
    scheduleInitialWarmup: scheduleInitialAgentConnectionWarmup,
  });
  registerAllHandlers();
  setupProbeBroadcast(workspaceWindowManager);
  setupSpawnNotificationBroadcast(workspaceWindowManager);
  setupSpawnedSessionViewBroadcast(workspaceWindowManager);
  setupAgentEventBroadcast(workspaceWindowManager);
  setupProposalStatusBroadcast(workspaceWindowManager);
  disposeWorkflowRunBroadcast = setupWorkflowRunBroadcast(workspaceWindowManager, workflowEngine);
  disposeWorkflowProposalBroadcast = setupWorkflowProposalBroadcast(workspaceWindowManager);
  disposeWorkflowProposalDecisionBroadcast =
    setupWorkflowProposalDecisionBroadcast(workspaceWindowManager);
  workflowProposalService.setConfirmHandoffHandler(sendWorkflowConfirmHandoff);
  workflowAgentRunner.attachToEngine(workflowEngine);
  workflowActionRunner.attachEngine(workflowEngine);
  spawnedSessionManager.start();
  registerSpawnRpcBridge();
  registerWorkflowRpcBridge();
  unregisterSpawnParentDeletion ??= registerSpawnParentDeletionHandler(
    async (workspaceId, parentSessionId) => {
      await Promise.all([
        spawnedSessionManager.deleteParent(workspaceId, parentSessionId),
        workflowDecisionService.suppressParent(workspaceId, parentSessionId),
      ]);
    }
  );
  startBundledMcpHost();
  scheduleWorkflowReconcile();
  markLifecycleMetric("runtime-wired");

  const controller = createRuntimeController();
  const startupWindow = options.getStartupWindow();
  if (!startupWindow?.isUsable() || isShuttingDown()) return controller;

  const ownership = startupWindow.takeOwnership();
  const generation = workspaceWindowManager.reserveLauncherWindow(startupWindow.window, ownership);
  try {
    await activateFormalRenderer(startupWindow, generation);
    bindRendererReadiness(startupWindow.window, generation);
  } catch (error) {
    logger.error("[bootstrap] formal renderer failed to load", error);
    if (!startupWindow.window.isDestroyed()) startupWindow.destroy();
    await showFormalRendererFailure();
    return null;
  }
  return controller;
}

export function isFormalRendererSender(webContents: WebContents, generation: number): boolean {
  return workspaceWindowManager.isActiveFormalRenderer(webContents, generation);
}

export function prepareRuntimeWindowsForShutdown(
  startupWindow: StartupWindowController | null
): void {
  const seen = new Set<object>();
  const startupToken = startupWindow?.prepareForShutdown();
  if (startupToken) seen.add(startupToken);
  workspaceWindowManager.prepareForShutdown(seen);
}

export function getRuntimeWindowManager(): typeof workspaceWindowManager {
  return workspaceWindowManager;
}
