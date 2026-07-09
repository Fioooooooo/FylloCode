import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { PlatformAcpAgentChannels } from "@shared/ipc/platform/acp-agents.channels";
import type {
  AcpAgentStatus,
  AcpCustomAgentsJson,
  AcpInstallProgress,
  AcpInstalledRecord,
  AcpPromptCapabilities,
  AcpRegistry,
  AcpUninstallProgress,
} from "@shared/types/acp-agent";

function subscribeToChannel<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => {
    listener(payload);
  };

  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.off(channel, handler);
  };
}

export const acpAgentsApi = {
  getRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.getRegistry);
  },

  refreshRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.refreshRegistry);
  },

  getIcons(): Promise<IpcResponse<Record<string, string>>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.getIcons);
  },

  detectStatus(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.detectStatus);
  },

  detectStatusForced(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.detectStatusForced);
  },

  install(agentId: string): Promise<IpcResponse<AcpInstalledRecord>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.install, agentId);
  },

  uninstall(agentId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.uninstall, agentId);
  },

  ensureAgent(
    agentId: string
  ): Promise<IpcResponse<{ promptCapabilities: AcpPromptCapabilities }>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.ensureAgent, { agentId });
  },

  loadCapabilitiesCache(): Promise<IpcResponse<Record<string, AcpPromptCapabilities>>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.loadCapabilitiesCache);
  },

  saveCustomAgents(config: AcpCustomAgentsJson): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.saveCustomAgents, config);
  },

  loadCustomAgents(): Promise<IpcResponse<AcpCustomAgentsJson>> {
    return ipcRenderer.invoke(PlatformAcpAgentChannels.loadCustomAgents);
  },

  onRegistryUpdated(listener: (registry: AcpRegistry) => void): () => void {
    return subscribeToChannel(PlatformAcpAgentChannels.registryUpdated, listener);
  },

  onStatusUpdated(listener: (statuses: AcpAgentStatus[]) => void): () => void {
    return subscribeToChannel(PlatformAcpAgentChannels.statusUpdated, listener);
  },

  onInstallProgress(listener: (progress: AcpInstallProgress) => void): () => void {
    return subscribeToChannel(PlatformAcpAgentChannels.installProgress, listener);
  },

  onUninstallProgress(listener: (progress: AcpUninstallProgress) => void): () => void {
    return subscribeToChannel(PlatformAcpAgentChannels.uninstallProgress, listener);
  },

  onAgentUnavailable(listener: (event: { agentId: string; reason: string }) => void): () => void {
    return subscribeToChannel(PlatformAcpAgentChannels.agentUnavailable, listener);
  },
};
