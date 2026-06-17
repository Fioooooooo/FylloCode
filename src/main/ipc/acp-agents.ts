import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { AcpAgentChannels } from "@shared/types/channels";
import {
  ensureAgentInputSchema,
  installAgentInputSchema,
  saveCustomAgentsInputSchema,
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
  onAgentServiceEvent,
  reloadAgentRegistry,
  saveCustomAgents,
  uninstallAgentById,
} from "@main/services/acp-agent/acp-agent-service";
import { onAgentUnavailable } from "@main/infra/process/acp-process-pool";
import { loadCache } from "@main/infra/storage/agent-capability-store";
import { readCustomAgents } from "@main/infra/storage/custom-agent-config-store";

let agentEventWindow: BrowserWindow | null = null;
let agentEventSubscribed = false;

/**
 * 将 acp-process-pool（infra）与 acp-agent-service（services）发出的事件
 * 转发到渲染进程。下层只发事件、不持有 BrowserWindow；窗口发送统一留在
 * ipc 层（与 chat 的 setupProbeBroadcast 同一模式）。重开窗口时更新目标
 * 引用，订阅只挂一次。
 */
export function setupAgentEventBroadcast(mainWindow: BrowserWindow): void {
  agentEventWindow = mainWindow;
  if (agentEventSubscribed) {
    return;
  }
  agentEventSubscribed = true;

  const sendToWindow = (channel: string, payload: unknown): void => {
    if (agentEventWindow?.isDestroyed()) {
      return;
    }
    agentEventWindow?.webContents.send(channel, payload);
  };

  onAgentUnavailable(({ agentId, reason }) => {
    sendToWindow(AcpAgentChannels.agentUnavailable, { agentId, reason });
  });
  onAgentServiceEvent("registryUpdated", (registry) => {
    sendToWindow(AcpAgentChannels.registryUpdated, registry);
  });
  onAgentServiceEvent("statusUpdated", (statuses) => {
    sendToWindow(AcpAgentChannels.statusUpdated, statuses);
  });
  onAgentServiceEvent("installProgress", (progress) => {
    sendToWindow(AcpAgentChannels.installProgress, progress);
  });
  onAgentServiceEvent("uninstallProgress", (progress) => {
    sendToWindow(AcpAgentChannels.uninstallProgress, progress);
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
  ipcMain.handle(AcpAgentChannels.loadCustomAgents, () =>
    wrapHandler(async () => readCustomAgents())
  );
  ipcMain.handle(AcpAgentChannels.saveCustomAgents, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(saveCustomAgentsInputSchema, input);
      await saveCustomAgents(form);
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
