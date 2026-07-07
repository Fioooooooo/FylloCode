import { ipcMain } from "electron";
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
import type { ProjectWindowManager } from "@main/bootstrap/project-window-manager";

let agentEventManager: ProjectWindowManager | null = null;
let agentEventSubscribed = false;

/**
 * 将 acp-process-pool（infra）与 acp-agent-service（services）发出的事件
 * 转发到所有活跃渲染进程。下层只发事件、不持有 BrowserWindow；窗口 fanout
 * 统一通过 ProjectWindowManager 完成，订阅只挂一次。
 */
export function setupAgentEventBroadcast(manager: ProjectWindowManager): void {
  agentEventManager = manager;
  if (agentEventSubscribed) {
    return;
  }
  agentEventSubscribed = true;

  const sendToWindows = (channel: string, payload: unknown): void => {
    agentEventManager?.sendToAll(channel, payload);
  };

  onAgentUnavailable(({ agentId, reason }) => {
    sendToWindows(AcpAgentChannels.agentUnavailable, { agentId, reason });
  });
  onAgentServiceEvent("registryUpdated", (registry) => {
    sendToWindows(AcpAgentChannels.registryUpdated, registry);
  });
  onAgentServiceEvent("statusUpdated", (statuses) => {
    sendToWindows(AcpAgentChannels.statusUpdated, statuses);
  });
  onAgentServiceEvent("installProgress", (progress) => {
    sendToWindows(AcpAgentChannels.installProgress, progress);
  });
  onAgentServiceEvent("uninstallProgress", (progress) => {
    sendToWindows(AcpAgentChannels.uninstallProgress, progress);
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
