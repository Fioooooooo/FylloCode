import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
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
import { onAgentUnavailable } from "@main/infra/process/acp-process-pool";
import { loadCache } from "@main/infra/storage/agent-capability-store";

let agentEventWindow: BrowserWindow | null = null;
let agentEventSubscribed = false;

/**
 * 将 acp-process-pool 的 agentUnavailable 事件转发到渲染进程。
 * infra 层只发事件、不持有 BrowserWindow；窗口发送统一留在 ipc 层
 * （与 chat 的 setupProbeBroadcast 同一模式）。重开窗口时更新目标引用，
 * 订阅只挂一次。
 */
export function setupAgentEventBroadcast(mainWindow: BrowserWindow): void {
  agentEventWindow = mainWindow;
  if (agentEventSubscribed) {
    return;
  }
  agentEventSubscribed = true;
  onAgentUnavailable(({ agentId, reason }) => {
    if (agentEventWindow?.isDestroyed()) {
      return;
    }
    agentEventWindow?.webContents.send(AcpAgentChannels.agentUnavailable, { agentId, reason });
  });
}

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
