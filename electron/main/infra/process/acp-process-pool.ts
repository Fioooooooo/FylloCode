import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { Writable, Readable } from "stream";
import { BrowserWindow } from "electron";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";
import { readInstalledRecords } from "@main/domain/acp/detector";
import { getRegistry } from "@main/services/acp-agent/registry-cache";
import type { AcpAgentEntry } from "@shared/types/acp-agent";
import { AcpAgentChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { registerDisposable } from "@main/bootstrap/lifecycle";
import { ipcError } from "@main/ipc/_kit/errors";
import logger from "@main/infra/logger";

type SessionUpdateHandler = (notification: SessionNotification) => void;

interface AgentProcess {
  connection: ClientSideConnection;
  child: ChildProcessWithoutNullStreams;
  ready: boolean;
  sessionHandlers: Map<string, SessionUpdateHandler>;
  failures: number;
}

const pool = new Map<string, AgentProcess>();
const restarting = new Map<string, Promise<AgentProcess>>();
const giveUp = new Set<string>();

// Exponential backoff for automatic restarts after an unexpected exit.
// The length of this array doubles as the give-up threshold.
const BACKOFF_MS = [0, 500, 2_000, 5_000] as const;

function broadcastAgentUnavailable(agentId: string, reason: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(AcpAgentChannels.agentUnavailable, { agentId, reason });
  }
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
        handler?.(notification);
      },
    }),
    stream
  );

  await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
    clientInfo: { name: "FylloCode", version: "1.0.0" },
  });

  const entry: AgentProcess = {
    connection,
    child,
    ready: true,
    sessionHandlers,
    failures: priorFailures,
  };
  pool.set(agentId, entry);

  child.on("exit", (code) => {
    logger.warn(`[infra.process.acp] agent ${agentId} exited (code=${code})`);
    pool.delete(agentId);

    if (stderrBuffer.trim()) {
      logger.warn(`[infra.process.acp] ${agentId} stderr(final): ${stderrBuffer.trimEnd()}`);
      stderrBuffer = "";
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
  return startProcess(agentId, 0);
}

async function dispose(): Promise<void> {
  const entries = Array.from(pool.values());
  pool.clear();
  restarting.clear();

  await Promise.all(
    entries.map(
      (entry) =>
        new Promise<void>((resolve) => {
          const onClose = (): void => resolve();
          entry.child.once("close", onClose);
          try {
            entry.child.kill();
          } catch {
            resolve();
          }
          setTimeout(() => {
            entry.child.removeListener("close", onClose);
            resolve();
          }, 2_000);
        })
    )
  );
}

registerDisposable({ name: "acp-process-pool", dispose });

/** Test-only: reset internal state between tests. */
export function resetAcpPoolForTests(): void {
  pool.clear();
  restarting.clear();
  giveUp.clear();
}
