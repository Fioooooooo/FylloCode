import type { BrowserWindow } from "electron";
import logger from "@main/infra/logger";
import { beginShutdown, runLifecyclePhases, type LifecyclePhase } from "./lifecycle";
import { markLifecycleMetric } from "./startup-metrics";
import type { StartupWindowController } from "./startup";

export const SHUTDOWN_DEADLINE_MS = 4_000;
export const FORCE_CONFIRM_RESERVE_MS = 500;

export const SHUTDOWN_PHASES = [
  {
    name: "snapshot-and-hide",
    tasks: [
      { name: "persist-and-hide-windows", owner: "bootstrap/window", api: "snapshotAndHide" },
    ],
  },
  {
    name: "quiesce",
    tasks: [
      { name: "startup-barrier-timer", owner: "bootstrap/startup", api: "abort" },
      {
        name: "renderer-interactive-fallback",
        owner: "services/platform/lifecycle",
        api: "cancelRendererFallback",
      },
      {
        name: "agent-connection-warmup",
        owner: "services/platform/acp-agent",
        api: "beginWarmupShutdown",
      },
      {
        name: "session-registry",
        owner: "services/session/chat",
        api: "disposeSessions",
      },
      {
        name: "session-probes",
        owner: "services/session/chat",
        api: "disposeSessionProbes",
      },
      {
        name: "proposal-status-watchers",
        owner: "services/proposal/browser",
        api: "unwatchProposals",
      },
      {
        name: "lineage-event-watchers",
        owner: "services/insight/lineage",
        api: "disposeLineage",
      },
      {
        name: "mcp-access-grants",
        owner: "infra/mcp",
        api: "revokeMcpGrants",
      },
      {
        name: "agent-install-operations",
        owner: "services/platform/acp-agent",
        api: "abortInstallerOperations",
        pidOwnership: "npx/uvx/archive process groups",
      },
      {
        name: "built-in-workflow-initialization",
        owner: "services/automation/workflow",
        api: "abortAndAwaitWorkflowInitialization",
      },
      {
        name: "bundled-mcp-host-quiesce",
        owner: "infra/mcp",
        api: "beginMcpHostShutdown",
      },
      {
        name: "auxiliary-command-quiesce",
        owner: "infra/process",
        api: "beginAuxiliaryProcessShutdown",
      },
    ],
  },
  {
    name: "terminate",
    tasks: [
      {
        name: "acp-process-pool",
        owner: "infra/process",
        api: "disposeAcpProcessPool",
        forceApi: "forceDisposeAcpProcessPool",
        pidOwnership: "ACP process groups",
      },
      {
        name: "bundled-mcp-host",
        owner: "infra/mcp",
        api: "stopBundledMcpHost",
        forceApi: "forceStopBundledMcpHost",
        pidOwnership: "bundled MCP process groups",
      },
      {
        name: "auxiliary-processes",
        owner: "infra/process",
        api: "disposeAuxiliaryProcesses",
        forceApi: "forceDisposeAuxiliaryProcesses",
        pidOwnership: "shell/Git/detector process groups",
      },
      {
        name: "agent-install-processes",
        owner: "services/platform/acp-agent",
        api: "awaitInstallerOperations",
        forceApi: "forceAbortInstallerOperations",
        pidOwnership: "npx/uvx/archive process groups",
      },
    ],
  },
  {
    name: "finalize",
    tasks: [{ name: "lifecycle-log", owner: "bootstrap", api: "finalize" }],
  },
] as const;

export interface ShutdownRuntimeResources {
  getProtectedMutation(): Promise<void> | null;
  snapshotAndHide(): void;
  cancelRendererFallback(): void;
  beginWarmupShutdown(): void;
  disposeSessions(): void;
  disposeSessionProbes(): Promise<void>;
  unwatchProposals(): void;
  disposeLineage(): void;
  revokeMcpGrants(): void;
  abortInstallerOperations(): void;
  awaitInstallerOperations(): Promise<void>;
  forceAbortInstallerOperations(): void;
  abortAndAwaitWorkflowInitialization(): Promise<void>;
  beginAcpProcessPoolShutdown(): void;
  disposeAcpProcessPool(): Promise<void>;
  forceDisposeAcpProcessPool(): Promise<void> | void;
  beginMcpHostShutdown(): void;
  stopBundledMcpHost(): Promise<void>;
  forceStopBundledMcpHost(): Promise<void> | void;
  beginAuxiliaryProcessShutdown(): void;
  disposeAuxiliaryProcesses(): Promise<void>;
  forceDisposeAuxiliaryProcesses(): void;
}

interface RequestApplicationShutdownOptions {
  startupWindow: StartupWindowController | null;
  exit(code: number): void;
}

let runtimeResources: ShutdownRuntimeResources | null = null;
let shutdownPromise: Promise<void> | null = null;
const trackedWindows = new Set<BrowserWindow>();

const SHUTDOWN_PHASE_METRICS = {
  "snapshot-and-hide": "shutdown-snapshot-and-hide",
  quiesce: "shutdown-quiesce",
  terminate: "shutdown-terminate",
  finalize: "shutdown-finalize",
} as const;

export function configureShutdownRuntimeResources(resources: ShutdownRuntimeResources): void {
  runtimeResources = resources;
}

function snapshotAndHideKnownWindows(startupWindow?: StartupWindowController | null): void {
  if (runtimeResources) {
    runtimeResources.snapshotAndHide();
  } else {
    startupWindow?.prepareForShutdown();
  }
  for (const window of trackedWindows) {
    if (!window.isDestroyed()) window.hide();
  }
  markLifecycleMetric("windows-hidden");
}

function createShutdownPhases(
  startupWindow: StartupWindowController | null
): readonly LifecyclePhase[] {
  const resources = runtimeResources;
  return [
    {
      name: "snapshot-and-hide",
      tasks: [
        {
          name: "persist-and-hide-windows",
          // requestApplicationShutdown 已在等待 protected mutation 前同步完成此动作。
          run: () => undefined,
        },
      ],
    },
    {
      name: "quiesce",
      tasks: [
        { name: "startup-barrier-timer", run: () => startupWindow?.abort() },
        {
          name: "renderer-interactive-fallback",
          run: () => resources?.cancelRendererFallback(),
        },
        { name: "agent-connection-warmup", run: () => resources?.beginWarmupShutdown() },
        { name: "session-registry", run: () => resources?.disposeSessions() },
        { name: "session-probes", run: () => resources?.disposeSessionProbes() },
        { name: "proposal-status-watchers", run: () => resources?.unwatchProposals() },
        { name: "lineage-event-watchers", run: () => resources?.disposeLineage() },
        { name: "mcp-access-grants", run: () => resources?.revokeMcpGrants() },
        {
          name: "agent-install-operations",
          run: () => resources?.abortInstallerOperations(),
        },
        {
          name: "built-in-workflow-initialization",
          run: () => resources?.abortAndAwaitWorkflowInitialization(),
        },
        {
          name: "bundled-mcp-host-quiesce",
          run: () => resources?.beginMcpHostShutdown(),
        },
        {
          name: "auxiliary-command-quiesce",
          run: () => resources?.beginAuxiliaryProcessShutdown(),
        },
      ],
    },
    {
      name: "terminate",
      tasks: [
        {
          name: "acp-process-pool",
          run: async () => {
            resources?.beginAcpProcessPoolShutdown();
            await resources?.disposeAcpProcessPool();
          },
          force: () => resources?.forceDisposeAcpProcessPool(),
        },
        {
          name: "bundled-mcp-host",
          run: () => resources?.stopBundledMcpHost(),
          force: () => resources?.forceStopBundledMcpHost(),
        },
        {
          name: "auxiliary-processes",
          run: () => resources?.disposeAuxiliaryProcesses(),
          force: () => resources?.forceDisposeAuxiliaryProcesses(),
        },
        {
          name: "agent-install-processes",
          run: () => resources?.awaitInstallerOperations(),
          force: () => resources?.forceAbortInstallerOperations(),
        },
      ],
    },
    {
      name: "finalize",
      tasks: [{ name: "lifecycle-log", run: () => undefined }],
    },
  ];
}

function markShutdownPhase(phase: string, status: "fulfilled" | "rejected" | "pending"): void {
  const metric = SHUTDOWN_PHASE_METRICS[phase as keyof typeof SHUTDOWN_PHASE_METRICS];
  if (!metric) return;
  markLifecycleMetric(
    metric,
    status === "pending" ? "timeout" : status === "rejected" ? "failed" : "ok"
  );
}

function logShutdownTasks(
  results: Awaited<ReturnType<typeof runLifecyclePhases>>["results"]
): void {
  for (const result of results) {
    const phase = /^[a-z0-9-]{1,64}$/.test(result.phase) ? result.phase : "invalid-phase";
    const name = /^[a-z0-9-]{1,64}$/.test(result.task) ? result.task : "invalid-name";
    logger.info(
      `[lifecycle-task] ${JSON.stringify({
        operation: "shutdown",
        phase,
        name,
        durationMs: Math.round(result.durationMs * 10) / 10,
        result:
          result.status === "pending" ? "timeout" : result.status === "rejected" ? "failed" : "ok",
      })}`
    );
  }
}

function runEmergencyShutdown(): void {
  if (!beginShutdown()) return;
  markLifecycleMetric("shutdown-requested");
  snapshotAndHideKnownWindows();
  const resources = runtimeResources;
  resources?.cancelRendererFallback();
  resources?.beginWarmupShutdown();
  resources?.disposeSessions();
  resources?.unwatchProposals();
  resources?.disposeLineage();
  resources?.revokeMcpGrants();
  resources?.abortInstallerOperations();
  resources?.forceAbortInstallerOperations();
  resources?.beginAcpProcessPoolShutdown();
  void resources?.forceDisposeAcpProcessPool();
  resources?.beginMcpHostShutdown();
  void resources?.forceStopBundledMcpHost();
  resources?.beginAuxiliaryProcessShutdown();
  resources?.forceDisposeAuxiliaryProcesses();
}

export function attachEmergencyShutdown(window: BrowserWindow): void {
  trackedWindows.add(window);
  window.once("closed", () => trackedWindows.delete(window));
  window.on("query-session-end", runEmergencyShutdown);
  window.on("session-end", runEmergencyShutdown);
}

export function requestApplicationShutdown(
  options: RequestApplicationShutdownOptions
): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  if (!beginShutdown()) return Promise.resolve();

  markLifecycleMetric("shutdown-requested");
  snapshotAndHideKnownWindows(options.startupWindow);
  options.startupWindow?.abort();

  shutdownPromise = (async () => {
    const protectedMutation = runtimeResources?.getProtectedMutation();
    if (protectedMutation) {
      markLifecycleMetric("shutdown-waiting-protected-migration");
      await Promise.allSettled([protectedMutation]);
    }

    const markedPhases = new Set<string>();
    const result = await runLifecyclePhases(createShutdownPhases(options.startupWindow), {
      deadlineMs: SHUTDOWN_DEADLINE_MS,
      forceReserveMs: FORCE_CONFIRM_RESERVE_MS,
      onPhaseSettled: (phase, status) => {
        markedPhases.add(phase);
        markShutdownPhase(phase, status);
      },
    });
    logShutdownTasks(result.results);
    for (const phase of SHUTDOWN_PHASES) {
      if (!markedPhases.has(phase.name)) markShutdownPhase(phase.name, "pending");
    }
    if (result.deadlineReached) markLifecycleMetric("shutdown-deadline", "timeout");
    markLifecycleMetric("shutdown-complete");
    logger.info("[bootstrap] shutdown complete", {
      deadlineReached: result.deadlineReached,
      pendingTasks: result.pendingTasks,
    });
  })().finally(() => options.exit(0));

  return shutdownPromise;
}

export function resetShutdownForTests(): void {
  runtimeResources = null;
  shutdownPromise = null;
  trackedWindows.clear();
}
