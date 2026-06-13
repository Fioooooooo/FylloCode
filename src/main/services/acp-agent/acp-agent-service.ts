import { BrowserWindow } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import {
  normalizePromptCapabilities,
  type AcpAgentStatus,
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
import { ipcError } from "@main/ipc/_kit/errors";
import logger from "@main/infra/logger";

export function broadcastRegistryUpdated(registry: AcpRegistry): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.registryUpdated, registry);
  }
}

export function broadcastStatusUpdated(statuses: AcpAgentStatus[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.statusUpdated, statuses);
  }
}

export function broadcastInstallProgress(progress: AcpInstallProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.installProgress, progress);
  }
}

export function broadcastUninstallProgress(progress: AcpUninstallProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.uninstallProgress, progress);
  }
}

export function loadAgentRegistry(): Promise<AcpRegistry> {
  return getRegistry({ onUpdated: broadcastRegistryUpdated });
}

export function reloadAgentRegistry(): Promise<AcpRegistry> {
  return refreshRegistry({ onUpdated: broadcastRegistryUpdated });
}

export async function listAgentIcons(): Promise<Record<string, string>> {
  const registry = await loadAgentRegistry();
  return getAgentIcons(registry);
}

/** 后台刷新去重：同一时刻只允许一次后台检测在飞行 */
let statusRefreshInFlight: Promise<AcpAgentStatus[]> | null = null;

async function refreshStatusesInBackground(): Promise<AcpAgentStatus[]> {
  const registry = await loadAgentRegistry();
  const statuses = await detectAgentStatuses(registry);
  await writeStatusCache(statuses);
  broadcastStatusUpdated(statuses);
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

  const registry = await loadAgentRegistry();
  const statuses = await detectAgentStatuses(registry);
  await writeStatusCache(statuses);
  return statuses;
}

/**
 * 强制实时检测：绕过缓存，前台等待真实结果并写回缓存。
 * 服务于设置页手动刷新及安装/卸载后的状态刷新。
 */
export async function detectAgentStatusesForced(): Promise<AcpAgentStatus[]> {
  const registry = await loadAgentRegistry();
  const statuses = await detectAgentStatuses(registry);
  await writeStatusCache(statuses);
  return statuses;
}

export async function installAgentById(agentId: string): Promise<void> {
  const registry = await loadAgentRegistry();
  const agent = registry.agents.find((item) => item.id === agentId);
  if (!agent) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `未知 Agent: ${agentId}`);
  }
  await installAgent(agent, broadcastInstallProgress);
}

export async function uninstallAgentById(agentId: string): Promise<void> {
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

  await uninstallAgent(agent, record.installMethod, broadcastUninstallProgress);
  await removeInstalledRecord(agentId);
  await removeAgentCapabilities(agentId);
}

export async function ensureAgent(agentId: string): Promise<{
  promptCapabilities: AcpPromptCapabilities;
}> {
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
