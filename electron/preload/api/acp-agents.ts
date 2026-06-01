import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { AcpAgentChannels } from "@shared/types/channels";
import type {
  AcpAgentStatus,
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
    return ipcRenderer.invoke(AcpAgentChannels.getRegistry);
  },

  refreshRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return ipcRenderer.invoke(AcpAgentChannels.refreshRegistry);
  },

  getIcons(): Promise<IpcResponse<Record<string, string>>> {
    return ipcRenderer.invoke(AcpAgentChannels.getIcons);
  },

  detectStatus(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return ipcRenderer.invoke(AcpAgentChannels.detectStatus);
  },

  detectStatusForced(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return ipcRenderer.invoke(AcpAgentChannels.detectStatusForced);
  },

  install(agentId: string): Promise<IpcResponse<AcpInstalledRecord>> {
    return ipcRenderer.invoke(AcpAgentChannels.install, agentId);
  },

  uninstall(agentId: string): Promise<IpcResponse<void>> {
    return ipcRenderer.invoke(AcpAgentChannels.uninstall, agentId);
  },

  ensureAgent(
    agentId: string
  ): Promise<IpcResponse<{ promptCapabilities: AcpPromptCapabilities }>> {
    return ipcRenderer.invoke(AcpAgentChannels.ensureAgent, { agentId });
  },

  loadCapabilitiesCache(): Promise<IpcResponse<Record<string, AcpPromptCapabilities>>> {
    return ipcRenderer.invoke(AcpAgentChannels.loadCapabilitiesCache);
  },

  onRegistryUpdated(listener: (registry: AcpRegistry) => void): () => void {
    return subscribeToChannel(AcpAgentChannels.registryUpdated, listener);
  },

  onStatusUpdated(listener: (statuses: AcpAgentStatus[]) => void): () => void {
    return subscribeToChannel(AcpAgentChannels.statusUpdated, listener);
  },

  onInstallProgress(listener: (progress: AcpInstallProgress) => void): () => void {
    return subscribeToChannel(AcpAgentChannels.installProgress, listener);
  },

  onUninstallProgress(listener: (progress: AcpUninstallProgress) => void): () => void {
    return subscribeToChannel(AcpAgentChannels.uninstallProgress, listener);
  },

  onAgentUnavailable(listener: (event: { agentId: string; reason: string }) => void): () => void {
    return subscribeToChannel(AcpAgentChannels.agentUnavailable, listener);
  },
};
