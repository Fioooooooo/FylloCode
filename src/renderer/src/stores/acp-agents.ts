import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { acpAgentsApi } from "@renderer/api/acp-agents";
import { appApi } from "@renderer/api/app";
import { useSessionStore } from "./session";
import type {
  AcpAgentStatus,
  AcpCustomAgentsJson,
  AcpInstallProgress,
  AcpPromptCapabilities,
  AcpRegistry,
  AcpUninstallProgress,
} from "@shared/types/acp-agent";

const DEFAULT_PROMPT_CAPABILITIES: AcpPromptCapabilities = {
  image: false,
  audio: false,
  embeddedContext: false,
};

export const useAcpAgentsStore = defineStore("acp-agents", () => {
  const registry = ref<AcpRegistry | null>(null);
  const icons = ref<Record<string, string>>({});
  const statuses = ref<Record<string, AcpAgentStatus>>({});
  const installProgress = ref<Record<string, AcpInstallProgress>>({});
  const uninstallProgress = ref<Record<string, AcpUninstallProgress>>({});
  const promptCapabilitiesByAgent = ref<Map<string, AcpPromptCapabilities>>(new Map());
  const userDataPath = ref("");
  const registryLoading = ref(false);
  const registryError = ref<string | null>(null);
  const initialized = ref(false);
  const initializing = ref(false);
  const initializationError = ref<string | null>(null);
  const installedAgentIds = computed<string[]>(() => {
    const installed = new Set(
      Object.values(statuses.value)
        .filter((status) => status.installed || status.source === "custom")
        .map((status) => status.id)
    );

    if (installed.size === 0) {
      return [];
    }

    const orderedFromRegistry =
      registry.value?.agents.flatMap((agent) => (installed.has(agent.id) ? [agent.id] : [])) ?? [];

    for (const agentId of Object.keys(statuses.value)) {
      if (installed.has(agentId) && !orderedFromRegistry.includes(agentId)) {
        orderedFromRegistry.push(agentId);
      }
    }

    return orderedFromRegistry;
  });

  let stopRegistryUpdatedListener: (() => void) | null = null;
  let stopStatusUpdatedListener: (() => void) | null = null;
  let stopInstallProgressListener: (() => void) | null = null;
  let stopUninstallProgressListener: (() => void) | null = null;
  let stopAgentUnavailableListener: (() => void) | null = null;
  let initPromise: Promise<void> | null = null;

  function mapStatuses(items: AcpAgentStatus[]): Record<string, AcpAgentStatus> {
    return items.reduce<Record<string, AcpAgentStatus>>((acc, status) => {
      acc[status.id] = status;
      return acc;
    }, {});
  }

  function ensureAgentListeners(): void {
    if (!stopRegistryUpdatedListener) {
      stopRegistryUpdatedListener = acpAgentsApi.onRegistryUpdated((nextRegistry) => {
        registry.value = nextRegistry;
        registryError.value = null;
        void loadIcons();
        void refreshStatus();
      });
    }

    if (!stopStatusUpdatedListener) {
      stopStatusUpdatedListener = acpAgentsApi.onStatusUpdated((nextStatuses) => {
        statuses.value = mapStatuses(nextStatuses);
      });
    }

    if (!stopInstallProgressListener) {
      stopInstallProgressListener = acpAgentsApi.onInstallProgress((progress) => {
        installProgress.value = {
          ...installProgress.value,
          [progress.agentId]: progress,
        };
      });
    }

    if (!stopUninstallProgressListener) {
      stopUninstallProgressListener = acpAgentsApi.onUninstallProgress((progress) => {
        uninstallProgress.value = {
          ...uninstallProgress.value,
          [progress.agentId]: progress,
        };
      });
    }

    if (!stopAgentUnavailableListener) {
      stopAgentUnavailableListener = acpAgentsApi.onAgentUnavailable(({ agentId }) => {
        const next = new Map(promptCapabilitiesByAgent.value);
        next.delete(agentId);
        promptCapabilitiesByAgent.value = next;
        useSessionStore().applyProbeUpdate(agentId, null);
      });
    }
  }

  function isInstalledAgent(agentId: string | null | undefined): agentId is string {
    return (
      agentId != null && (statuses.value[agentId]?.installed === true || isCustomAgentId(agentId))
    );
  }

  function resolveInstalledAgent(preferredAgentId?: string | null): string | null {
    if (isInstalledAgent(preferredAgentId)) {
      return preferredAgentId;
    }

    return installedAgentIds.value[0] ?? null;
  }

  function isCustomAgentId(agentId: string | null | undefined): agentId is string {
    return agentId != null && agentId.startsWith("custom-");
  }

  function getAgentLabel(agentId: string): string {
    if (isCustomAgentId(agentId)) {
      return statuses.value[agentId]?.name ?? agentId;
    }
    return registry.value?.agents.find((agent) => agent.id === agentId)?.name ?? agentId;
  }

  async function loadRegistry(): Promise<void> {
    ensureAgentListeners();
    registryLoading.value = true;
    try {
      const response = await acpAgentsApi.getRegistry();
      if (response.ok) {
        registry.value = response.data;
        registryError.value = null;
      } else if (!registry.value) {
        registryError.value = response.error.message;
      }
    } finally {
      registryLoading.value = false;
    }
  }

  async function loadIcons(): Promise<void> {
    ensureAgentListeners();
    const response = await acpAgentsApi.getIcons();
    if (!response.ok) {
      return;
    }

    icons.value = {
      ...icons.value,
      ...response.data,
    };
  }

  async function refreshStatus(force = false): Promise<void> {
    ensureAgentListeners();
    const response = force
      ? await acpAgentsApi.detectStatusForced()
      : await acpAgentsApi.detectStatus();
    if (!response.ok) {
      return;
    }

    statuses.value = mapStatuses(response.data);
  }

  async function loadCapabilitiesCache(): Promise<void> {
    ensureAgentListeners();
    const response = await acpAgentsApi.loadCapabilitiesCache();
    if (!response.ok) {
      return;
    }

    promptCapabilitiesByAgent.value = new Map(Object.entries(response.data));
  }

  async function ensureUserDataPath(): Promise<void> {
    if (userDataPath.value) {
      return;
    }

    const response = await appApi.getUserDataPath();
    if (!response.ok) {
      return;
    }

    userDataPath.value = response.data;
  }

  async function loadCustomAgents(): Promise<AcpCustomAgentsJson | null> {
    ensureAgentListeners();
    const response = await acpAgentsApi.loadCustomAgents();
    if (!response.ok) {
      return null;
    }
    return response.data;
  }

  async function saveCustomAgents(config: AcpCustomAgentsJson): Promise<void> {
    ensureAgentListeners();
    const response = await acpAgentsApi.saveCustomAgents(config);
    if (!response.ok) {
      throw new Error(response.error.message);
    }

    // 保存成功后后台刷新状态； capabilities 缓存已在主进程清除
    void refreshStatus(true);
  }

  async function refreshCapabilities(agentId: string): Promise<void> {
    ensureAgentListeners();
    const response = await acpAgentsApi.ensureAgent(agentId);
    if (!response.ok) {
      return;
    }

    promptCapabilitiesByAgent.value = new Map(promptCapabilitiesByAgent.value).set(
      agentId,
      response.data.promptCapabilities
    );
  }

  function getPromptCapabilities(agentId: string | null | undefined): AcpPromptCapabilities {
    if (!agentId) {
      return DEFAULT_PROMPT_CAPABILITIES;
    }

    return promptCapabilitiesByAgent.value.get(agentId) ?? DEFAULT_PROMPT_CAPABILITIES;
  }

  async function ensureInitialized(): Promise<void> {
    ensureAgentListeners();

    if (initialized.value) {
      return;
    }

    if (initPromise) {
      return initPromise;
    }

    initializing.value = true;
    initializationError.value = null;
    initPromise = (async () => {
      await loadRegistry();
      await Promise.all([loadIcons(), refreshStatus(), ensureUserDataPath()]);
      initialized.value = true;
    })();

    try {
      await initPromise;
    } catch (error) {
      initializationError.value = error instanceof Error ? error.message : String(error);
      initialized.value = false;
      throw error;
    } finally {
      initPromise = null;
      initializing.value = false;
    }
  }

  async function refreshAll(): Promise<void> {
    ensureAgentListeners();

    registryLoading.value = true;
    initializationError.value = null;
    try {
      const response = await acpAgentsApi.refreshRegistry();
      if (response.ok) {
        registry.value = response.data;
        registryError.value = null;
      } else if (!registry.value) {
        registryError.value = response.error.message;
      }

      await Promise.all([loadIcons(), refreshStatus(true)]);
      initialized.value = true;
    } catch (error) {
      initializationError.value = error instanceof Error ? error.message : String(error);
      initialized.value = false;
      throw error;
    } finally {
      registryLoading.value = false;
    }
  }

  async function installAgent(agentId: string): Promise<void> {
    ensureAgentListeners();

    const response = await acpAgentsApi.install(agentId);
    if (!response.ok) {
      installProgress.value = {
        ...installProgress.value,
        [agentId]: {
          agentId,
          status: "error",
          message: response.error.message,
        },
      };
      return;
    }

    await refreshStatus(true);
    installProgress.value = {
      ...installProgress.value,
      [agentId]: {
        agentId,
        status: "done",
      },
    };
  }

  async function uninstallAgent(agentId: string): Promise<void> {
    ensureAgentListeners();

    const response = await acpAgentsApi.uninstall(agentId);
    if (!response.ok) {
      uninstallProgress.value = {
        ...uninstallProgress.value,
        [agentId]: {
          agentId,
          status: "error",
          message: response.error.message,
        },
      };
      return;
    }

    await refreshStatus(true);
    uninstallProgress.value = {
      ...uninstallProgress.value,
      [agentId]: {
        agentId,
        status: "done",
      },
    };
  }

  return {
    registry,
    icons,
    statuses,
    installProgress,
    uninstallProgress,
    promptCapabilitiesByAgent,
    userDataPath,
    registryLoading,
    registryError,
    initialized,
    initializing,
    initializationError,
    installedAgentIds,
    ensureAgentListeners,
    isInstalledAgent,
    isCustomAgentId,
    resolveInstalledAgent,
    getAgentLabel,
    ensureInitialized,
    refreshAll,
    loadRegistry,
    loadIcons,
    refreshStatus,
    loadCapabilitiesCache,
    ensureUserDataPath,
    refreshCapabilities,
    loadCustomAgents,
    saveCustomAgents,
    getPromptCapabilities,
    installAgent,
    uninstallAgent,
  };
});
