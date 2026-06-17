import { EventEmitter } from "events";
import {
  normalizePromptCapabilities,
  type AcpAgentStatus,
  type AcpCustomAgentsJson,
  type AcpInstallProgress,
  type AcpPromptCapabilities,
  type AcpRegistry,
  type AcpUninstallProgress,
} from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  detectAgentStatuses,
  readInstalledRecords,
  removeInstalledRecord,
} from "@main/infra/acp/detector";
import { getAgentIcons } from "@main/infra/storage/acp-icon-cache";
import { installAgent, uninstallAgent } from "@main/services/acp-agent/installer";
import { getRegistry, refreshRegistry } from "@main/infra/storage/acp-registry-cache";
import { readStatusCache, writeStatusCache } from "@main/infra/storage/acp-status-cache";
import { getOrStartProcess } from "@main/infra/process/acp-process-pool";
import {
  getCachedPromptCapabilities,
  removeAgentCapabilities,
} from "@main/infra/storage/agent-capability-store";
import { writeCustomAgents } from "@main/infra/storage/custom-agent-config-store";
import { listAgents, getAgentById, isCustomAgentId } from "@main/infra/acp/agent-catalog-service";
import { ipcError } from "@main/ipc/_kit/errors";
import logger from "@main/infra/logger";

/**
 * Service-layer event bus for agent registry/status/install updates. The
 * service emits; the ipc layer (acp-agents.ts) owns the BrowserWindow and
 * forwards these to the renderer. Keeps services free of Electron window
 * APIs — same pattern as the process pool's agentUnavailable event.
 */
const agentServiceEvents = new EventEmitter();

interface AgentServiceEventMap {
  registryUpdated: AcpRegistry;
  statusUpdated: AcpAgentStatus[];
  installProgress: AcpInstallProgress;
  uninstallProgress: AcpUninstallProgress;
}

export function onAgentServiceEvent<K extends keyof AgentServiceEventMap>(
  event: K,
  listener: (payload: AgentServiceEventMap[K]) => void
): () => void {
  agentServiceEvents.on(event, listener);
  return () => {
    agentServiceEvents.off(event, listener);
  };
}

function emitRegistryUpdated(registry: AcpRegistry): void {
  agentServiceEvents.emit("registryUpdated", registry);
}

function emitStatusUpdated(statuses: AcpAgentStatus[]): void {
  agentServiceEvents.emit("statusUpdated", statuses);
}

function emitInstallProgress(progress: AcpInstallProgress): void {
  agentServiceEvents.emit("installProgress", progress);
}

function emitUninstallProgress(progress: AcpUninstallProgress): void {
  agentServiceEvents.emit("uninstallProgress", progress);
}

export function loadAgentRegistry(): Promise<AcpRegistry> {
  return getRegistry({ onUpdated: emitRegistryUpdated });
}

export function reloadAgentRegistry(): Promise<AcpRegistry> {
  return refreshRegistry({ onUpdated: emitRegistryUpdated });
}

export async function listAgentIcons(): Promise<Record<string, string>> {
  const registry = await loadAgentRegistry();
  return getAgentIcons(registry);
}

/** 后台刷新去重：同一时刻只允许一次后台检测在飞行 */
let statusRefreshInFlight: Promise<AcpAgentStatus[]> | null = null;

async function refreshStatusesInBackground(): Promise<AcpAgentStatus[]> {
  const agents = await listAgents();
  const statuses = await detectAgentStatuses(agents);
  await writeStatusCache(statuses);
  emitStatusUpdated(statuses);
  return statuses;
}

function triggerBackgroundStatusRefresh(): void {
  if (statusRefreshInFlight) {
    return;
  }
  statusRefreshInFlight = refreshStatusesInBackground()
    .catch((error: unknown) => {
      logger.warn("[acp-agent-service] background status refresh failed", error);
      return [];
    })
    .finally(() => {
      statusRefreshInFlight = null;
    }) as Promise<AcpAgentStatus[]>;
}

/**
 * 自动检测（stale-while-revalidate）：有缓存立即返回并后台刷新，无缓存前台检测。
 * 服务于 `acp:detectStatus`。
 */
export async function listAgentStatuses(): Promise<AcpAgentStatus[]> {
  const cached = await readStatusCache();
  if (cached) {
    triggerBackgroundStatusRefresh();
    return cached.statuses;
  }

  const agents = await listAgents();
  const statuses = await detectAgentStatuses(agents);
  await writeStatusCache(statuses);
  return statuses;
}

/**
 * 强制实时检测：绕过缓存，前台等待真实结果并写回缓存。
 * 服务于设置页手动刷新及安装/卸载后的状态刷新。
 */
export async function detectAgentStatusesForced(): Promise<AcpAgentStatus[]> {
  const agents = await listAgents();
  const statuses = await detectAgentStatuses(agents);
  await writeStatusCache(statuses);
  return statuses;
}

export async function saveCustomAgents(config: AcpCustomAgentsJson): Promise<void> {
  await writeCustomAgents(config);
  const agents = await listAgents();
  const statuses = await detectAgentStatuses(agents);
  await writeStatusCache(statuses);
  emitStatusUpdated(statuses);
}

export async function installAgentById(agentId: string): Promise<void> {
  const registry = await loadAgentRegistry();
  const agent = registry.agents.find((item) => item.id === agentId);
  if (!agent) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `未知 Agent: ${agentId}`);
  }
  await installAgent(agent, emitInstallProgress);
}

export async function uninstallAgentById(agentId: string): Promise<void> {
  if (isCustomAgentId(agentId)) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, "自定义 Agent 不支持卸载操作");
  }

  const registry = await loadAgentRegistry();
  const agent = registry.agents.find((item) => item.id === agentId);
  if (!agent) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `未知 Agent: ${agentId}`);
  }

  const records = await readInstalledRecords();
  const record = records[agentId];
  if (!record) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `Agent ${agentId} is not installed`);
  }

  await uninstallAgent(agent, record.installMethod, emitUninstallProgress);
  await removeInstalledRecord(agentId);
  await removeAgentCapabilities(agentId);
}

export async function ensureAgent(agentId: string): Promise<{
  promptCapabilities: AcpPromptCapabilities;
}> {
  if (isCustomAgentId(agentId)) {
    const agent = await getAgentById(agentId);
    if (!agent || agent.source !== "custom") {
      throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `Agent ${agentId} is not configured`);
    }

    const cached = await getCachedPromptCapabilities(agentId);
    if (cached && cached.capturedAgentVersion === "") {
      void getOrStartProcess(agentId).catch((error: unknown) => {
        logger.error(`[acp-agent-service] failed to lazily start ${agentId}`, error);
      });
      return { promptCapabilities: cached.capabilities };
    }

    const agentProcess = await getOrStartProcess(agentId);
    return {
      promptCapabilities: normalizePromptCapabilities(
        agentProcess.initializeResponse.agentCapabilities?.promptCapabilities
      ),
    };
  }

  const records = await readInstalledRecords();
  const installed = records[agentId];
  if (!installed) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `Agent ${agentId} is not installed`);
  }

  const cached = await getCachedPromptCapabilities(agentId);
  if (cached && cached.capturedAgentVersion === (installed.installedVersion ?? "")) {
    void getOrStartProcess(agentId).catch((error: unknown) => {
      logger.error(`[acp-agent-service] failed to lazily start ${agentId}`, error);
    });
    return { promptCapabilities: cached.capabilities };
  }

  const agentProcess = await getOrStartProcess(agentId);
  return {
    promptCapabilities: normalizePromptCapabilities(
      agentProcess.initializeResponse.agentCapabilities?.promptCapabilities
    ),
  };
}
