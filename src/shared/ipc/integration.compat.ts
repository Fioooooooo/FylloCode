import { PlatformProvidersChannels } from "./platform/providers.channels";
import { AutomationProjectIntegrationChannels } from "./automation/project-integration.channels";

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
