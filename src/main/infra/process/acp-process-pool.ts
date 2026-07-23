import type { ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import { Writable, Readable } from "stream";
import spawn from "cross-spawn";
import { app } from "electron";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";
import type { InitializeResponse } from "@agentclientprotocol/sdk";
import { readInstalledRecords, resolveBinaryDistribution } from "@main/infra/acp/detector";
import { getRegistry } from "@main/infra/storage/acp-registry-cache";
import { getAgentById, isCustomAgentId } from "@main/infra/acp/agent-catalog";
import {
  normalizePromptCapabilities,
  type AcpAgentEntry,
  type CatalogAgent,
} from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import { registerDisposable } from "@main/bootstrap/lifecycle";
import { upsertPromptCapabilities } from "@main/infra/storage/agent-capability-store";
import logger from "@main/infra/logger";

export type SessionUpdateHandler = (notification: SessionNotification) => void;
type AgentUnavailableListener = (event: { agentId: string; reason: string }) => void;
export interface AgentProcessInvalidatedEvent {
  agentId: string;
  reason: string;
}
type AgentProcessInvalidatedListener = (event: AgentProcessInvalidatedEvent) => void;

interface AgentSpawnSpec {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

interface AgentProcess {
  connection: ClientSideConnection;
  child: ChildProcessWithoutNullStreams;
  ready: boolean;
  sessionHandlers: Map<string, SessionUpdateHandler>;
  // Fallback handler for session/update notifications that arrive before any
  // precise sessionId handler is registered. Used by the draft-session probe
  // to capture metadata (e.g. available_commands_update) that the agent pushes
  // asynchronously right after newSession returns, when no prompt-turn handler
  // exists yet. Precise sessionId handlers always take priority.
  pendingProbeHandler?: SessionUpdateHandler;
  failures: number;
  initializeResponse: InitializeResponse;
  generation: number;
}

interface StartingProcess {
  child: ChildProcessWithoutNullStreams;
  generation: number;
}

interface RestartState {
  promise: Promise<AgentProcess>;
  timer: NodeJS.Timeout;
  reject: (error: Error) => void;
  generation: number;
}

const pool = new Map<string, AgentProcess>();
const startingProcesses = new Map<string, StartingProcess>();
const restarting = new Map<string, RestartState>();
const pendingStarts = new Map<string, Promise<AgentProcess>>();
const giveUp = new Set<string>();
const restartTimers = new Map<string, NodeJS.Timeout>();
const generations = new Map<string, number>();
let shuttingDown = false;
const processPoolEvents = new EventEmitter();

// Exponential backoff for automatic restarts after an unexpected exit.
// The length of this array doubles as the give-up threshold.
const BACKOFF_MS = [0, 500, 2_000, 5_000] as const;

const GRACEFUL_CLOSE_TIMEOUT_MS = 500;
const SIGKILL_GRACE_MS = 500;
const TASKKILL_TIMEOUT_MS = 500;
const CLOSE_SESSION_TIMEOUT_MS = 300;

const IS_WINDOWS = process.platform === "win32";

function broadcastAgentUnavailable(agentId: string, reason: string): void {
  // infra 层只发事件，不直接持有 BrowserWindow。窗口转发由 ipc 层订阅
  // onAgentUnavailable 完成（见 ipc/acp-agents.ts 的 setupAgentEventBroadcast）。
  processPoolEvents.emit("agentUnavailable", { agentId, reason });
}

function broadcastProcessInvalidated(agentId: string, reason: string): void {
  processPoolEvents.emit("processInvalidated", { agentId, reason });
}

export function onAgentUnavailable(listener: AgentUnavailableListener): () => void {
  processPoolEvents.on("agentUnavailable", listener);
  return () => {
    processPoolEvents.off("agentUnavailable", listener);
  };
}

export function onAgentProcessInvalidated(listener: AgentProcessInvalidatedListener): () => void {
  processPoolEvents.on("processInvalidated", listener);
  return () => {
    processPoolEvents.off("processInvalidated", listener);
  };
}

function currentGeneration(agentId: string): number {
  return generations.get(agentId) ?? 0;
}

function invalidateGeneration(agentId: string): number {
  const generation = currentGeneration(agentId) + 1;
  generations.set(agentId, generation);
  return generation;
}

function isCurrentGeneration(agentId: string, generation: number): boolean {
  return !shuttingDown && currentGeneration(agentId) === generation;
}

function mergeSpawnEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
  return env ? { ...process.env, ...env } : process.env;
}

function applyAgentSpawnWorkarounds(agentId: string, spec: AgentSpawnSpec): AgentSpawnSpec {
  if (agentId !== "claude-acp") return spec;

  return {
    ...spec,
    env: {
      ...spec.env,
      // TODO: Claude Code runtime 修复首轮 MCP 异步注册竞态后移除此临时兼容开关。
      MCP_CONNECTION_NONBLOCKING: "0",
    },
  };
}

function buildCustomSpawnSpec(agent: CatalogAgent): AgentSpawnSpec {
  const config = agent.customConfig;
  if (!config) {
    throw new Error(`No custom config for agent ${agent.id}`);
  }
  return {
    cmd: config.command,
    args: config.args,
    env: mergeSpawnEnv(config.env),
  };
}

export function buildSpawnSpecForTesting(
  agent: CatalogAgent,
  installPath?: string,
  installMethod?: string
): AgentSpawnSpec {
  if (agent.source === "custom") {
    return applyAgentSpawnWorkarounds(agent.id, buildCustomSpawnSpec(agent));
  }
  if (!agent.registryEntry || !installMethod) {
    throw new Error("Registry agent requires registryEntry and installMethod");
  }
  return applyAgentSpawnWorkarounds(
    agent.id,
    buildSpawnSpec(agent.registryEntry, installPath, installMethod)
  );
}

function buildSpawnSpec(
  agent: AcpAgentEntry,
  installPath: string | undefined,
  installMethod: string
): AgentSpawnSpec {
  if (installMethod === "npx" && agent.distribution.npx) {
    const distribution = agent.distribution.npx;
    // Strip version suffix so npx uses the already-installed version, not the registry version
    const barePackage = distribution.package.replace(/@[\d].*$/, "").replace(/(@[^@/]+)@.*$/, "$1");
    return {
      cmd: "npx",
      args: ["--no-install", barePackage, ...(distribution.args ?? [])],
      env: mergeSpawnEnv(distribution.env),
    };
  }
  if (installMethod === "uvx" && agent.distribution.uvx) {
    const distribution = agent.distribution.uvx;
    return {
      cmd: "uvx",
      args: [distribution.package, ...(distribution.args ?? [])],
      env: mergeSpawnEnv(distribution.env),
    };
  }
  if (!installPath) throw new Error(`No installPath for binary agent ${agent.id}`);
  const distribution = resolveBinaryDistribution(agent.distribution.binary);
  return {
    cmd: installPath,
    args: distribution?.args ?? [],
    env: mergeSpawnEnv(distribution?.env),
  };
}

async function startProcess(
  agentId: string,
  priorFailures: number,
  generation: number
): Promise<AgentProcess> {
  let spawnSpec: AgentSpawnSpec;
  let installedVersion: string | undefined;

  if (isCustomAgentId(agentId)) {
    const agent = await getAgentById(agentId);
    if (!agent || agent.source !== "custom") {
      throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `Agent ${agentId} is not configured`);
    }
    spawnSpec = buildCustomSpawnSpec(agent);
    installedVersion = "";
  } else {
    const records = await readInstalledRecords();
    const record = records[agentId];
    if (!record) throw new Error(`Agent ${agentId} is not installed`);

    const registry = await getRegistry();
    const agentEntry = registry.agents.find((a) => a.id === agentId);
    if (!agentEntry) throw new Error(`Agent ${agentId} not found in registry`);

    spawnSpec = buildSpawnSpec(agentEntry, record.installPath, record.installMethod);
    installedVersion = record.installedVersion;
  }

  const { cmd, args, env } = applyAgentSpawnWorkarounds(agentId, spawnSpec);
  if (!isCurrentGeneration(agentId, generation)) {
    throw new Error(`[infra.process.acp] start of ${agentId} was invalidated before spawn`);
  }
  logger.info(`[infra.process.acp] spawning agent ${agentId}: ${cmd} ${args.join(" ")}`);

  const child = spawn(cmd, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env,
    detached: !IS_WINDOWS,
  }) as ChildProcessWithoutNullStreams;
  const starting: StartingProcess = { child, generation };
  startingProcesses.set(agentId, starting);

  // Forward stderr into the logger so diagnostics survive in prod.
  let stderrBuffer = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrBuffer += chunk;
    let nl = stderrBuffer.indexOf("\n");
    while (nl !== -1) {
      const line = stderrBuffer.slice(0, nl).trimEnd();
      stderrBuffer = stderrBuffer.slice(nl + 1);
      if (line) logger.warn(`[infra.process.acp] ${agentId} stderr: ${line}`);
      nl = stderrBuffer.indexOf("\n");
    }
  });

  const sessionHandlers = new Map<string, SessionUpdateHandler>();

  const input = Writable.toWeb(child.stdin);
  const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
  const stream = ndJsonStream(input, output);

  const connection = new ClientSideConnection(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_agent) => ({
      async requestPermission(params: RequestPermissionRequest) {
        const allowOption = params.options.find((o) => o.kind === "allow_once");
        if (allowOption) {
          return { outcome: { outcome: "selected" as const, optionId: allowOption.optionId } };
        }
        return { outcome: { outcome: "cancelled" as const } };
      },
      async sessionUpdate(notification: SessionNotification) {
        const handler = sessionHandlers.get(notification.sessionId);
        if (handler) {
          handler(notification);
          return;
        }
        // No precise sessionId handler yet — fall back to the probe handler so
        // metadata pushed between newSession and the first prompt turn is not
        // dropped. `pool.get(agentId)` resolves the live entry because this
        // closure may run before `pool.set` has completed during start.
        pool.get(agentId)?.pendingProbeHandler?.(notification);
      },
    }),
    stream
  );

  try {
    if (!isCurrentGeneration(agentId, generation)) {
      throw new Error(`[infra.process.acp] start of ${agentId} was invalidated before initialize`);
    }

    const initializeResponse = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: "FylloCode", version: app.getVersion() },
    });
    if (!isCurrentGeneration(agentId, generation)) {
      throw new Error(`[infra.process.acp] start of ${agentId} was invalidated during initialize`);
    }
    logger.info(
      `[infra.process.acp] ${agentId} initialize response: ${JSON.stringify(initializeResponse)}`
    );

    try {
      await upsertPromptCapabilities(
        agentId,
        normalizePromptCapabilities(initializeResponse.agentCapabilities?.promptCapabilities),
        installedVersion ?? ""
      );
    } catch (error: unknown) {
      logger.error(
        `[infra.process.acp] failed to persist prompt capabilities for ${agentId}`,
        error
      );
    }
    if (!isCurrentGeneration(agentId, generation)) {
      throw new Error(`[infra.process.acp] start of ${agentId} was invalidated before ready`);
    }

    const entry: AgentProcess = {
      connection,
      child,
      ready: true,
      sessionHandlers,
      failures: priorFailures,
      initializeResponse,
      generation,
    };
    if (startingProcesses.get(agentId) === starting) {
      startingProcesses.delete(agentId);
    }
    pool.set(agentId, entry);

    child.on("exit", (code) => {
      logger.warn(`[infra.process.acp] agent ${agentId} exited (code=${code})`);
      if (pool.get(agentId) === entry) {
        pool.delete(agentId);
      }

      if (stderrBuffer.trim()) {
        logger.warn(`[infra.process.acp] ${agentId} stderr(final): ${stderrBuffer.trimEnd()}`);
        stderrBuffer = "";
      }

      if (!isCurrentGeneration(agentId, generation)) {
        return;
      }

      const nextFailures = entry.failures + 1;
      if (nextFailures > BACKOFF_MS.length) {
        giveUp.add(agentId);
        const reason = `${agentId} crashed ${nextFailures} times, giving up`;
        logger.error(`[infra.process.acp] ${reason}`);
        broadcastProcessInvalidated(agentId, reason);
        broadcastAgentUnavailable(agentId, reason);
        return;
      }

      scheduleRestart(agentId, nextFailures, generation);
    });

    return entry;
  } catch (error: unknown) {
    if (startingProcesses.get(agentId) === starting) {
      startingProcesses.delete(agentId);
    }
    await terminateChild(child);
    if (isCurrentGeneration(agentId, generation)) {
      logger.error(`[infra.process.acp] failed to start ${agentId}`, error);
    }
    throw error;
  }
}

export async function getOrStartProcess(agentId: string): Promise<AgentProcess> {
  if (shuttingDown) {
    throw ipcError(IpcErrorCodes.ACP_NOT_READY, "ACP process pool is shutting down");
  }
  if (giveUp.has(agentId)) {
    throw ipcError(
      IpcErrorCodes.ACP_EXIT_GIVEUP,
      `Agent ${agentId} has been disabled after repeated crashes`
    );
  }
  if (restarting.has(agentId)) {
    throw ipcError(IpcErrorCodes.ACP_NOT_READY, `Agent ${agentId} is restarting`);
  }
  const existing = pool.get(agentId);
  if (existing?.ready) {
    // Successful use resets the failure counter.
    existing.failures = 0;
    return existing;
  }
  const inflight = pendingStarts.get(agentId);
  if (inflight) {
    return inflight;
  }
  const generation = currentGeneration(agentId);
  const start = startProcess(agentId, 0, generation).finally(() => {
    if (pendingStarts.get(agentId) === start) {
      pendingStarts.delete(agentId);
    }
  });
  pendingStarts.set(agentId, start);
  return start;
}

function scheduleRestart(agentId: string, nextFailures: number, generation: number): void {
  const delayMs = BACKOFF_MS[Math.min(nextFailures - 1, BACKOFF_MS.length - 1)];
  logger.info(
    `[infra.process.acp] restarting ${agentId} in ${delayMs}ms (attempt ${nextFailures}/${BACKOFF_MS.length})`
  );

  let rejectRestart!: (error: Error) => void;
  const promise = new Promise<AgentProcess>((resolve, reject) => {
    rejectRestart = reject;
    const timer = setTimeout(() => {
      restartTimers.delete(agentId);
      if (!isCurrentGeneration(agentId, generation)) {
        reject(new Error(`[infra.process.acp] aborted stale restart of ${agentId}`));
        return;
      }
      startProcess(agentId, nextFailures, generation).then(resolve, reject);
    }, delayMs);
    restartTimers.set(agentId, timer);
  });

  const timer = restartTimers.get(agentId);
  if (!timer) {
    throw new Error(`Failed to schedule restart for ${agentId}`);
  }
  const state: RestartState = {
    promise,
    timer,
    reject: rejectRestart,
    generation,
  };
  restarting.set(agentId, state);
  promise
    .catch((error: unknown) => {
      if (isCurrentGeneration(agentId, generation)) {
        logger.error(`[infra.process.acp] failed to restart ${agentId}: ${String(error)}`);
      }
    })
    .finally(() => {
      if (restarting.get(agentId) === state) {
        restarting.delete(agentId);
      }
    });
}

/**
 * Register a fallback handler for session/update notifications that have no
 * precise sessionId handler yet. Used by the draft-session probe to capture
 * metadata the agent pushes asynchronously right after newSession returns.
 * No-op if the agent process is not currently in the pool.
 */
export function setPendingProbeHandler(agentId: string, handler: SessionUpdateHandler): void {
  const entry = pool.get(agentId);
  if (entry) {
    entry.pendingProbeHandler = handler;
  }
}

/** Remove the probe fallback handler so it does not leak after probe close. */
export function clearPendingProbeHandler(agentId: string, handler?: SessionUpdateHandler): void {
  const entry = pool.get(agentId);
  if (entry && (handler === undefined || entry.pendingProbeHandler === handler)) {
    entry.pendingProbeHandler = undefined;
  }
}

async function killProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;

  if (IS_WINDOWS) {
    await new Promise<void>((resolve) => {
      try {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
        let settled = false;
        const settle = (): void => {
          if (settled) return;
          settled = true;
          resolve();
        };
        killer.once("close", settle);
        killer.once("error", (err: unknown) => {
          logger.warn(`[infra.process.acp] taskkill failed for pid=${pid}: ${String(err)}`);
          settle();
        });
        setTimeout(() => {
          if (!settled) {
            logger.warn(`[infra.process.acp] taskkill timed out for pid=${pid}`);
          }
          settle();
        }, TASKKILL_TIMEOUT_MS);
      } catch (err: unknown) {
        logger.warn(`[infra.process.acp] taskkill spawn threw for pid=${pid}: ${String(err)}`);
        resolve();
      }
    });
    return;
  }

  // POSIX: signal the entire process group (negative pid). Requires the
  // child to have been spawned with `detached: true` so it became its own
  // group leader (pgid === pid).
  try {
    process.kill(-pid, "SIGTERM");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return;
    logger.warn(`[infra.process.acp] SIGTERM failed for pgid=${pid}: ${String(err)}`);
  }

  await new Promise<void>((resolve) => setTimeout(resolve, SIGKILL_GRACE_MS));

  try {
    process.kill(-pid, 0);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return;
    logger.warn(`[infra.process.acp] SIGKILL failed for pgid=${pid}: ${String(err)}`);
  }
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    child.stdin.end();
  } catch (error: unknown) {
    logger.warn(`[infra.process.acp] failed to close stdin for pid=${child.pid}`, error);
  }

  const exitedGracefully = await new Promise<boolean>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    const onClose = (): void => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.removeListener("close", onClose);
      resolve(false);
    }, GRACEFUL_CLOSE_TIMEOUT_MS);
    child.once("close", onClose);
  });

  if (!exitedGracefully && !child.killed) {
    await killProcessTree(child);
  }
}

async function closeReadyProcess(entry: AgentProcess): Promise<void> {
  const closePromises = Array.from(entry.sessionHandlers.keys()).map((sessionId) =>
    Promise.race([
      entry.connection.closeSession({ sessionId }).catch(() => {
        /* agent may not support close or the session may already be dead */
      }),
      new Promise<void>((resolve) => setTimeout(resolve, CLOSE_SESSION_TIMEOUT_MS)),
    ])
  );
  await Promise.all(closePromises);
  entry.sessionHandlers.clear();
  entry.pendingProbeHandler = undefined;
  await terminateChild(entry.child);
}

export async function stopAgentProcess(agentId: string, reason: string): Promise<void> {
  invalidateGeneration(agentId);

  const restart = restarting.get(agentId);
  if (restart) {
    clearTimeout(restart.timer);
    restartTimers.delete(agentId);
    restarting.delete(agentId);
    restart.reject(new Error(`[infra.process.acp] ${agentId} stopped intentionally: ${reason}`));
  }

  const ready = pool.get(agentId);
  const starting = startingProcesses.get(agentId);
  pool.delete(agentId);
  startingProcesses.delete(agentId);
  pendingStarts.delete(agentId);
  giveUp.delete(agentId);

  broadcastProcessInvalidated(agentId, reason);

  const terminations: Promise<void>[] = [];
  if (ready) {
    terminations.push(closeReadyProcess(ready));
  }
  if (starting && starting.child !== ready?.child) {
    terminations.push(terminateChild(starting.child));
  }
  await Promise.all(terminations);
}

async function dispose(): Promise<void> {
  shuttingDown = true;
  for (const agentId of new Set([
    ...pool.keys(),
    ...startingProcesses.keys(),
    ...pendingStarts.keys(),
    ...restarting.keys(),
  ])) {
    invalidateGeneration(agentId);
  }

  for (const [agentId, timer] of restartTimers) {
    clearTimeout(timer);
    restarting
      .get(agentId)
      ?.reject(new Error(`[infra.process.acp] aborted restart of ${agentId} during shutdown`));
  }
  restartTimers.clear();
  restarting.clear();

  const readyEntries = Array.from(pool.values());
  const startingEntries = Array.from(startingProcesses.values());
  pool.clear();
  startingProcesses.clear();
  pendingStarts.clear();
  giveUp.clear();

  const readyChildren = new Set(readyEntries.map((entry) => entry.child));
  await Promise.all([
    ...readyEntries.map(closeReadyProcess),
    ...startingEntries
      .filter(({ child }) => !readyChildren.has(child))
      .map(({ child }) => terminateChild(child)),
  ]);
}

registerDisposable({ name: "acp-process-pool", dispose });
