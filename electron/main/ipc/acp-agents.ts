import { ipcMain } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import { installAgentInputSchema } from "@shared/schemas/ipc/acp-agents";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  installAgentById,
  listAgentIcons,
  listAgentStatuses,
  loadAgentRegistry,
  reloadAgentRegistry,
} from "@main/services/acp-agent/acp-agent-service";

export function registerAcpAgentHandlers(): void {
  ipcMain.handle(AcpAgentChannels.getRegistry, () => wrapHandler(() => loadAgentRegistry()));
  ipcMain.handle(AcpAgentChannels.refreshRegistry, () => wrapHandler(() => reloadAgentRegistry()));
  ipcMain.handle(AcpAgentChannels.getIcons, () => wrapHandler(() => listAgentIcons()));
  ipcMain.handle(AcpAgentChannels.detectStatus, () => wrapHandler(() => listAgentStatuses()));
  ipcMain.handle(AcpAgentChannels.install, (_event, input: unknown) =>
    wrapHandler(async () => {
      const agentId = validate(installAgentInputSchema, input);
      await installAgentById(agentId);
    })
  );
}
