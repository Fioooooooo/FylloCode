import type { IpcResponse } from "@shared/types/ipc";
import type {
  AcpAgentStatus,
  AcpCustomAgentsJson,
  AcpInstallProgress,
  AcpInstalledRecord,
  AcpPromptCapabilities,
  AcpRegistry,
  AcpUninstallProgress,
} from "@shared/types/acp-agent";

export const acpAgentsApi = {
  getRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return window.api.platform.acpAgents.getRegistry();
  },

  refreshRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return window.api.platform.acpAgents.refreshRegistry();
  },

  getIcons(): Promise<IpcResponse<Record<string, string>>> {
    return window.api.platform.acpAgents.getIcons();
  },

  detectStatus(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return window.api.platform.acpAgents.detectStatus();
  },

  detectStatusForced(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return window.api.platform.acpAgents.detectStatusForced();
  },

  install(agentId: string): Promise<IpcResponse<AcpInstalledRecord>> {
    return window.api.platform.acpAgents.install(agentId);
  },

  uninstall(agentId: string): Promise<IpcResponse<void>> {
    return window.api.platform.acpAgents.uninstall(agentId);
  },

  ensureAgent(
    agentId: string
  ): Promise<IpcResponse<{ promptCapabilities: AcpPromptCapabilities }>> {
    return window.api.platform.acpAgents.ensureAgent(agentId);
  },

  loadCapabilitiesCache(): Promise<IpcResponse<Record<string, AcpPromptCapabilities>>> {
    return window.api.platform.acpAgents.loadCapabilitiesCache();
  },

  loadCustomAgents(): Promise<IpcResponse<AcpCustomAgentsJson>> {
    return window.api.platform.acpAgents.loadCustomAgents();
  },

  saveCustomAgents(config: AcpCustomAgentsJson): Promise<IpcResponse<void>> {
    return window.api.platform.acpAgents.saveCustomAgents(config);
  },

  onRegistryUpdated(listener: (registry: AcpRegistry) => void): () => void {
    return window.api.platform.acpAgents.onRegistryUpdated(listener);
  },

  onStatusUpdated(listener: (statuses: AcpAgentStatus[]) => void): () => void {
    return window.api.platform.acpAgents.onStatusUpdated(listener);
  },

  onInstallProgress(listener: (progress: AcpInstallProgress) => void): () => void {
    return window.api.platform.acpAgents.onInstallProgress(listener);
  },

  onUninstallProgress(listener: (progress: AcpUninstallProgress) => void): () => void {
    return window.api.platform.acpAgents.onUninstallProgress(listener);
  },

  onAgentUnavailable(listener: (event: { agentId: string; reason: string }) => void): () => void {
    return window.api.platform.acpAgents.onAgentUnavailable(listener);
  },
};
