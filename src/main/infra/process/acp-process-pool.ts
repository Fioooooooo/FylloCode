import type { ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import { Writable, Readable } from "stream";
import spawn from "cross-spawn";
import { app, BrowserWindow } from "electron";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";
import type { InitializeResponse } from "@agentclientprotocol/sdk";
import { readInstalledRecords } from "@main/domain/acp/detector";
import { getRegistry } from "@main/infra/storage/acp-registry-cache";
import { normalizePromptCapabilities, type AcpAgentEntry } from "@shared/types/acp-agent";
import { AcpAgentChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import { registerDisposable } from "@main/bootstrap/lifecycle";
import { upsertPromptCapabilities } from "@main/infra/storage/agent-capability-store";
import logger from "@main/infra/logger";

export type SessionUpdateHandler = (notification: SessionNotification) => void;
type AgentUnavailableListener = (event: { agentId: string; reason: string }) => void;

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
}

const pool = new Map<string, AgentProcess>();
const restarting = new Map<string, Promise<AgentProcess>>();
const pendingStarts = new Map<string, Promise<AgentProcess>>();
const giveUp = new Set<string>();
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
  processPoolEvents.emit("agentUnavailable", { agentId, reason });
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(AcpAgentChannels.agentUnavailable, { agentId, reason });
  }
}

export function onAgentUnavailable(listener: AgentUnavailableListener): () => void {
  processPoolEvents.on("agentUnavailable", listener);
  return () => {
    processPoolEvents.off("agentUnavailable", listener);
  };
}

function buildSpawnArgs(
  agent: AcpAgentEntry,
  installPath: string | undefined,
  installMethod: string
): { cmd: string; args: string[] } {
  if (installMethod === "npx" && agent.distribution.npx) {
    // Strip version suffix so npx uses the already-installed version, not the registry version
    const barePackage = agent.distribution.npx.package
      .replace(/@[\d].*$/, "")
      .replace(/(@[^@/]+)@.*$/, "$1");
    return {
      cmd: "npx",
      args: ["--no-install", barePackage, ...(agent.distribution.npx.args ?? [])],
    };
  }
  if (installMethod === "uvx" && agent.distribution.uvx) {
    return {
      cmd: "uvx",
      args: [agent.distribution.uvx.package, ...(agent.distribution.uvx.args ?? [])],
    };
  }
  if (!installPath) throw new Error(`No installPath for binary agent ${agent.id}`);
  return { cmd: installPath, args: [] };
}

async function startProcess(agentId: string, priorFailures: number): Promise<AgentProcess> {
  const records = await readInstalledRecords();
  const record = records[agentId];
  if (!record) throw new Error(`Agent ${agentId} is not installed`);

  const registry = await getRegistry();
  const agentEntry = registry.agents.find((a) => a.id === agentId);
  if (!agentEntry) throw new Error(`Agent ${agentId} not found in registry`);

  const { cmd, args } = buildSpawnArgs(agentEntry, record.installPath, record.installMethod);
  logger.info(`[infra.process.acp] spawning agent ${agentId}: ${cmd} ${args.join(" ")}`);

  const child = spawn(cmd, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    detached: !IS_WINDOWS,
  }) as ChildProcessWithoutNullStreams;

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

  const initializeResponse = await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
    clientInfo: { name: "FylloCode", version: app.getVersion() },
  });
  logger.info(
    `[infra.process.acp] ${agentId} initialize response: ${JSON.stringify(initializeResponse)}`
  );
  try {
    await upsertPromptCapabilities(
      agentId,
      normalizePromptCapabilities(initializeResponse.agentCapabilities?.promptCapabilities),
      record.installedVersion ?? ""
    );
  } catch (error: unknown) {
    logger.error(`[infra.process.acp] failed to persist prompt capabilities for ${agentId}`, error);
  }

  const entry: AgentProcess = {
    connection,
    child,
    ready: true,
    sessionHandlers,
    failures: priorFailures,
    initializeResponse,
  };
  pool.set(agentId, entry);

  child.on("exit", (code) => {
    logger.warn(`[infra.process.acp] agent ${agentId} exited (code=${code})`);
    pool.delete(agentId);

    if (stderrBuffer.trim()) {
      logger.warn(`[infra.process.acp] ${agentId} stderr(final): ${stderrBuffer.trimEnd()}`);
      stderrBuffer = "";
    }

    if (shuttingDown) {
      return;
    }

    const nextFailures = entry.failures + 1;
    if (nextFailures > BACKOFF_MS.length) {
      giveUp.add(agentId);
      const reason = `${agentId} crashed ${nextFailures} times, giving up`;
      logger.error(`[infra.process.acp] ${reason}`);
      broadcastAgentUnavailable(agentId, reason);
      return;
    }

    const delayMs = BACKOFF_MS[Math.min(entry.failures, BACKOFF_MS.length - 1)];
    logger.info(
      `[infra.process.acp] restarting ${agentId} in ${delayMs}ms (attempt ${nextFailures}/${BACKOFF_MS.length})`
    );

    const restart = new Promise<AgentProcess>((resolve, reject) => {
      setTimeout(() => {
        startProcess(agentId, nextFailures).then(resolve, reject);
      }, delayMs);
    });
    restarting.set(agentId, restart);
    restart
      .then(() => restarting.delete(agentId))
      .catch((err: unknown) => {
        restarting.delete(agentId);
        logger.error(`[infra.process.acp] failed to restart ${agentId}: ${String(err)}`);
      });
  });

  return entry;
}

export async function getOrStartProcess(agentId: string): Promise<AgentProcess> {
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
  const start = startProcess(agentId, 0).finally(() => {
    pendingStarts.delete(agentId);
  });
  pendingStarts.set(agentId, start);
  return start;
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
export function clearPendingProbeHandler(agentId: string): void {
  const entry = pool.get(agentId);
  if (entry) {
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

async function dispose(): Promise<void> {
  shuttingDown = true;
  const entries = Array.from(pool.values());
  pool.clear();
  restarting.clear();
  pendingStarts.clear();

  await Promise.all(
    entries.map(async (entry) => {
      // 1. Graceful: close every active session so the agent can clean up.
      //    Cap each closeSession with a short timeout — if the agent does
      //    not respond we fall through to signal-based teardown anyway.
      const closePromises = Array.from(entry.sessionHandlers.keys()).map((sessionId) =>
        Promise.race([
          entry.connection.closeSession({ sessionId }).catch(() => {
            /* ignore — agent may not support close or session already dead */
          }),
          new Promise<void>((resolve) => setTimeout(resolve, CLOSE_SESSION_TIMEOUT_MS)),
        ])
      );
      await Promise.all(closePromises);

      // 2. Graceful: close the stdio stream.  This sends EOF to the child
      //    process, which should exit cleanly without writing to stderr.
      entry.child.stdin.end();

      // 3. Wait for the child to exit (up to GRACEFUL_CLOSE_TIMEOUT_MS).
      const closed = new Promise<boolean>((resolve) => {
        if (entry.child.exitCode !== null || entry.child.signalCode !== null) {
          resolve(true);
          return;
        }
        const onClose = (): void => resolve(true);
        entry.child.once("close", onClose);
        setTimeout(() => {
          entry.child.removeListener("close", onClose);
          resolve(false);
        }, GRACEFUL_CLOSE_TIMEOUT_MS);
      });
      const exitedGracefully = await closed;

      // 4. If the child (or its descendants) is still alive, kill the whole
      //    process tree so MCP grandchildren are not orphaned.
      if (!exitedGracefully && !entry.child.killed) {
        await killProcessTree(entry.child);
      }
    })
  );
}

registerDisposable({ name: "acp-process-pool", dispose });
