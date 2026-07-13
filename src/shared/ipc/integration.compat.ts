import { PlatformProvidersChannels } from "./platform/providers.channels";
import { AutomationProjectIntegrationChannels } from "./automation/project-integration.channels";

// Compatibility shim: the legacy "Integration" surface spans both platform providers
// and project-level integration settings. New code should use the split domain channels
// directly; this object keeps older call sites working during the migration.
export const IntegrationChannels = {
  getConnections: PlatformProvidersChannels.getConnections,
  connect: PlatformProvidersChannels.connect,
  disconnect: PlatformProvidersChannels.disconnect,
  providersList: PlatformProvidersChannels.list,
  providersConnect: PlatformProvidersChannels.connectProvider,
  providersDisconnect: PlatformProvidersChannels.disconnectProvider,
  providersProbe: PlatformProvidersChannels.probe,
  providersListResources: PlatformProvidersChannels.listResources,
  projectGet: AutomationProjectIntegrationChannels.get,
  projectSet: AutomationProjectIntegrationChannels.set,
} as const;
