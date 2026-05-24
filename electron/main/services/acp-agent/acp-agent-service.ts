import { BrowserWindow } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import {
  normalizePromptCapabilities,
  type AcpInstallProgress,
  type AcpPromptCapabilities,
  type AcpRegistry,
} from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { detectAgentStatuses, readInstalledRecords } from "@main/domain/acp/detector";
import { getAgentIcons } from "@main/infra/storage/acp-icon-cache";
import { installAgent } from "@main/services/acp-agent/installer";
import { getRegistry, refreshRegistry } from "@main/infra/storage/acp-registry-cache";
import { getOrStartProcess } from "@main/infra/process/acp-process-pool";
import { getCachedPromptCapabilities } from "@main/infra/storage/agent-capability-store";
import { ipcError } from "@main/ipc/_kit/errors";
import logger from "@main/infra/logger";

export function broadcastRegistryUpdated(registry: AcpRegistry): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.registryUpdated, registry);
  }
}

export function broadcastInstallProgress(progress: AcpInstallProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.installProgress, progress);
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

export async function listAgentStatuses(): ReturnType<typeof detectAgentStatuses> {
  const registry = await loadAgentRegistry();
  return detectAgentStatuses(registry);
}

export async function installAgentById(agentId: string): Promise<void> {
  const registry = await loadAgentRegistry();
  const agent = registry.agents.find((item) => item.id === agentId);
  if (!agent) {
    throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `未知 Agent: ${agentId}`);
  }
  await installAgent(agent, broadcastInstallProgress);
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
