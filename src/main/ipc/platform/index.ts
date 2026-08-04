import { registerAcpAgentHandlers } from "./acp-agents";
import { registerAppHandlers } from "./app";
import { registerProviderHandlers } from "./providers";
import { registerReleaseHandlers } from "./release";
import { registerSettingsHandlers } from "./settings";
import { registerLifecycleHandlers } from "./lifecycle";

export function registerPlatformIpcHandlers(): void {
  registerAppHandlers();
  registerSettingsHandlers();
  registerReleaseHandlers();
  registerProviderHandlers();
  registerAcpAgentHandlers();
  registerLifecycleHandlers();
}
