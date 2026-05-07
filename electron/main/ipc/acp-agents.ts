import { BrowserWindow, ipcMain } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import type { AcpInstallProgress, AcpRegistry } from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { installAgentInputSchema } from "@shared/schemas/ipc/acp-agents";
import { detectAgentStatuses } from "@main/domain/acp/detector";
import { getAgentIcons } from "@main/services/acp-agent/icon-cache";
import { installAgent } from "@main/services/acp-agent/installer";
import { getRegistry, refreshRegistry } from "@main/services/acp-agent/registry-cache";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";

function broadcastRegistryUpdated(registry: AcpRegistry): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.registryUpdated, registry);
  }
}

function broadcastInstallProgress(progress: AcpInstallProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AcpAgentChannels.installProgress, progress);
  }
}

export function registerAcpAgentHandlers(): void {
  ipcMain.handle(AcpAgentChannels.getRegistry, () =>
    wrapHandler(async () =>
      getRegistry({
        onUpdated: broadcastRegistryUpdated,
      })
    )
  );

  ipcMain.handle(AcpAgentChannels.refreshRegistry, () =>
    wrapHandler(async () =>
      refreshRegistry({
        onUpdated: broadcastRegistryUpdated,
      })
    )
  );

  ipcMain.handle(AcpAgentChannels.getIcons, () =>
    wrapHandler(async () => {
      const registry = await getRegistry({
        onUpdated: broadcastRegistryUpdated,
      });
      return getAgentIcons(registry);
    })
  );

  ipcMain.handle(AcpAgentChannels.detectStatus, () =>
    wrapHandler(async () => {
      const registry = await getRegistry({
        onUpdated: broadcastRegistryUpdated,
      });
      return detectAgentStatuses(registry);
    })
  );

  ipcMain.handle(AcpAgentChannels.install, (_event, agentId: unknown) =>
    wrapHandler(async () => {
      const id = validate(installAgentInputSchema, agentId);
      const registry = await getRegistry({
        onUpdated: broadcastRegistryUpdated,
      });
      const agent = registry.agents.find((item) => item.id === id);
      if (!agent) {
        throw ipcError(IpcErrorCodes.AGENT_NOT_FOUND, `未知 Agent: ${id}`);
      }

      return installAgent(agent, broadcastInstallProgress);
    })
  );
}
