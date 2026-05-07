import { BrowserWindow } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import type { AcpInstallProgress, AcpRegistry } from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { detectAgentStatuses } from "@main/domain/acp/detector";
import { getAgentIcons } from "@main/services/acp-agent/icon-cache";
import { installAgent } from "@main/services/acp-agent/installer";
import { getRegistry, refreshRegistry } from "@main/services/acp-agent/registry-cache";
import { ipcError } from "@main/ipc/_kit/errors";

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
