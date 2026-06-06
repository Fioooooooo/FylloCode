import { ipcMain } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import {
  ensureAgentInputSchema,
  installAgentInputSchema,
  uninstallAgentInputSchema,
} from "@shared/schemas/ipc/acp-agents";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  detectAgentStatusesForced,
  ensureAgent,
  installAgentById,
  listAgentIcons,
  listAgentStatuses,
  loadAgentRegistry,
  reloadAgentRegistry,
  uninstallAgentById,
} from "@main/services/acp-agent/acp-agent-service";
import { loadCache } from "@main/infra/storage/agent-capability-store";

export function registerAcpAgentHandlers(): void {
  ipcMain.handle(AcpAgentChannels.getRegistry, () => wrapHandler(() => loadAgentRegistry()));
  ipcMain.handle(AcpAgentChannels.refreshRegistry, () => wrapHandler(() => reloadAgentRegistry()));
  ipcMain.handle(AcpAgentChannels.getIcons, () => wrapHandler(() => listAgentIcons()));
  ipcMain.handle(AcpAgentChannels.detectStatus, () => wrapHandler(() => listAgentStatuses()));
  ipcMain.handle(AcpAgentChannels.detectStatusForced, () =>
    wrapHandler(() => detectAgentStatusesForced())
  );
  ipcMain.handle(AcpAgentChannels.ensureAgent, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(ensureAgentInputSchema, input);
      return ensureAgent(form.agentId);
    })
  );
  ipcMain.handle(AcpAgentChannels.loadCapabilitiesCache, () =>
    wrapHandler(async () => {
      const cache = await loadCache();
      return Object.fromEntries(
        Object.entries(cache).map(([agentId, entry]) => [agentId, entry.promptCapabilities])
      );
    })
  );
  ipcMain.handle(AcpAgentChannels.install, (_event, input: unknown) =>
    wrapHandler(async () => {
      const agentId = validate(installAgentInputSchema, input);
      await installAgentById(agentId);
    })
  );
  ipcMain.handle(AcpAgentChannels.uninstall, (_event, input: unknown) =>
    wrapHandler(async () => {
      const agentId = validate(uninstallAgentInputSchema, input);
      await uninstallAgentById(agentId);
    })
  );
}
