import { spawn } from "child_process";
import { Writable, Readable } from "stream";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { RequestPermissionRequest, SessionNotification } from "@agentclientprotocol/sdk";
import { readInstalledRecords } from "@main/domain/acp/detector";
import { getRegistry } from "@main/services/acp-agent/registry-cache";
import type { AcpAgentEntry } from "@shared/types/acp-agent";
import logger from "@main/infra/logger";

type SessionUpdateHandler = (notification: SessionNotification) => void;

interface AgentProcess {
  connection: ClientSideConnection;
  ready: boolean;
  sessionHandlers: Map<string, SessionUpdateHandler>;
}

const pool = new Map<string, AgentProcess>();
const restarting = new Set<string>();

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

async function startProcess(agentId: string): Promise<AgentProcess> {
  const records = await readInstalledRecords();
  const record = records[agentId];
  if (!record) throw new Error(`Agent ${agentId} is not installed`);

  const registry = await getRegistry();
  const agentEntry = registry.agents.find((a) => a.id === agentId);
  if (!agentEntry) throw new Error(`Agent ${agentId} not found in registry`);

  const { cmd, args } = buildSpawnArgs(agentEntry, record.installPath, record.installMethod);
  logger.info(`[acp-pool] spawning agent ${agentId}: ${cmd} ${args.join(" ")}`);

  const child = spawn(cmd, args, {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });

  const sessionHandlers = new Map<string, SessionUpdateHandler>();

  const input = Writable.toWeb(child.stdin!);
  const output = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
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

  const entry: AgentProcess = { connection, ready: true, sessionHandlers };
  pool.set(agentId, entry);

  child.on("exit", (code) => {
    logger.warn(`[acp-pool] agent ${agentId} exited (code=${code}), scheduling restart`);
    pool.delete(agentId);
    restarting.add(agentId);
    startProcess(agentId)
      .then(() => restarting.delete(agentId))
      .catch((err: unknown) => {
        restarting.delete(agentId);
        logger.error(`[acp-pool] failed to restart agent ${agentId}: ${String(err)}`);
      });
  });

  return entry;
}

export async function getOrStartProcess(agentId: string): Promise<AgentProcess> {
  if (restarting.has(agentId)) {
    throw Object.assign(new Error(`Agent ${agentId} is restarting`), { code: "ACP_NOT_READY" });
  }
  const existing = pool.get(agentId);
  if (existing?.ready) return existing;
  return startProcess(agentId);
}
