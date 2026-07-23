import { registerDisposable } from "@main/bootstrap/lifecycle";
import { listAgents } from "@main/infra/acp/agent-catalog";
import { readInstalledRecords } from "@main/infra/acp/detector";
import logger from "@main/infra/logger";
import { getOrStartProcess } from "@main/infra/process/acp-process-pool";

const MAX_CONCURRENT_WARMUPS = 2;

export interface AgentConnectionWarmupResult {
  agentId: string;
  status: "ready" | "failed";
  error?: string;
}

interface WarmupJob {
  agentId: string;
  promise: Promise<AgentConnectionWarmupResult>;
  resolve: (result: AgentConnectionWarmupResult) => void;
}

const queue: WarmupJob[] = [];
const pendingByAgent = new Map<string, Promise<AgentConnectionWarmupResult>>();
let activeWorkers = 0;
let initialWarmupImmediate: NodeJS.Immediate | null = null;
let aborted = false;

function failedResult(agentId: string, error: unknown): AgentConnectionWarmupResult {
  return {
    agentId,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
}

async function runJob(job: WarmupJob): Promise<void> {
  const startedAt = Date.now();
  logger.info(`[acp-agent-warmup] warming ${job.agentId}`);
  let result: AgentConnectionWarmupResult;
  try {
    await getOrStartProcess(job.agentId);
    result = { agentId: job.agentId, status: "ready" };
    logger.info(`[acp-agent-warmup] warmed ${job.agentId} in ${Date.now() - startedAt}ms`);
  } catch (error: unknown) {
    result = failedResult(job.agentId, error);
    logger.warn(
      `[acp-agent-warmup] failed to warm ${job.agentId} in ${Date.now() - startedAt}ms`,
      error
    );
  }

  if (pendingByAgent.get(job.agentId) === job.promise) {
    pendingByAgent.delete(job.agentId);
  }
  activeWorkers -= 1;
  job.resolve(result);
  pumpQueue();
}

function pumpQueue(): void {
  while (!aborted && activeWorkers < MAX_CONCURRENT_WARMUPS && queue.length > 0) {
    const job = queue.shift();
    if (!job) {
      return;
    }
    activeWorkers += 1;
    void runJob(job);
  }
}

function enqueue(agentId: string): Promise<AgentConnectionWarmupResult> {
  if (aborted) {
    return Promise.resolve(failedResult(agentId, "ACP connection warmup is shutting down"));
  }
  const existing = pendingByAgent.get(agentId);
  if (existing) {
    return existing;
  }

  let resolveJob!: (result: AgentConnectionWarmupResult) => void;
  const promise = new Promise<AgentConnectionWarmupResult>((resolve) => {
    resolveJob = resolve;
  });
  const job: WarmupJob = { agentId, promise, resolve: resolveJob };
  pendingByAgent.set(agentId, promise);
  queue.push(job);
  pumpQueue();
  return promise;
}

export async function resolveInstalledAgentIds(): Promise<string[]> {
  const [agents, installedRecords] = await Promise.all([listAgents(), readInstalledRecords()]);
  return agents
    .filter((agent) => agent.source === "custom" || installedRecords[agent.id] !== undefined)
    .map((agent) => agent.id);
}

export async function prewarmAgentConnections(
  agentIds: readonly string[]
): Promise<AgentConnectionWarmupResult[]> {
  const uniqueAgentIds = [...new Set(agentIds)];
  const startedAt = Date.now();
  logger.info(
    `[acp-agent-warmup] batch starting total=${uniqueAgentIds.length} agents=${uniqueAgentIds.join(",") || "none"}`
  );
  const results = await Promise.all(uniqueAgentIds.map(enqueue));
  const ready = results.filter((result) => result.status === "ready").length;
  logger.info(
    `[acp-agent-warmup] batch completed total=${results.length} ready=${ready} failed=${results.length - ready} in ${Date.now() - startedAt}ms`
  );
  return results;
}

export async function prewarmInstalledAgentConnections(): Promise<AgentConnectionWarmupResult[]> {
  return prewarmAgentConnections(await resolveInstalledAgentIds());
}

export function scheduleInstalledAgentConnectionWarmup(): void {
  if (aborted || initialWarmupImmediate) {
    return;
  }

  initialWarmupImmediate = setImmediate(() => {
    initialWarmupImmediate = null;
    void prewarmInstalledAgentConnections().catch((error: unknown) => {
      logger.error("[acp-agent-warmup] failed to discover installed agents", error);
    });
  });
}

function dispose(): void {
  aborted = true;
  if (initialWarmupImmediate) {
    clearImmediate(initialWarmupImmediate);
    initialWarmupImmediate = null;
  }

  const cancelled = queue.splice(0);
  for (const job of cancelled) {
    if (pendingByAgent.get(job.agentId) === job.promise) {
      pendingByAgent.delete(job.agentId);
    }
    job.resolve(failedResult(job.agentId, "ACP connection warmup was cancelled"));
  }
}

registerDisposable({ name: "acp-agent-connection-warmup", dispose });
