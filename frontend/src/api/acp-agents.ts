import type { IpcResponse } from "@shared/types/ipc";
import type {
  AcpAgentStatus,
  AcpInstallProgress,
  AcpInstalledRecord,
  AcpPromptCapabilities,
  AcpRegistry,
} from "@shared/types/acp-agent";

export const acpAgentsApi = {
  getRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return window.api.acpAgents.getRegistry();
  },

  refreshRegistry(): Promise<IpcResponse<AcpRegistry>> {
    return window.api.acpAgents.refreshRegistry();
  },

  getIcons(): Promise<IpcResponse<Record<string, string>>> {
    return window.api.acpAgents.getIcons();
  },

  detectStatus(): Promise<IpcResponse<AcpAgentStatus[]>> {
    return window.api.acpAgents.detectStatus();
  },

  install(agentId: string): Promise<IpcResponse<AcpInstalledRecord>> {
    return window.api.acpAgents.install(agentId);
  },

  ensureAgent(
    agentId: string
  ): Promise<IpcResponse<{ promptCapabilities: AcpPromptCapabilities }>> {
    return window.api.acpAgents.ensureAgent(agentId);
  },

  loadCapabilitiesCache(): Promise<IpcResponse<Record<string, AcpPromptCapabilities>>> {
    return window.api.acpAgents.loadCapabilitiesCache();
  },

  onRegistryUpdated(listener: (registry: AcpRegistry) => void): () => void {
    return window.api.acpAgents.onRegistryUpdated(listener);
  },

  onInstallProgress(listener: (progress: AcpInstallProgress) => void): () => void {
    return window.api.acpAgents.onInstallProgress(listener);
  },

  onAgentUnavailable(listener: (event: { agentId: string; reason: string }) => void): () => void {
    return window.api.acpAgents.onAgentUnavailable(listener);
  },
};
