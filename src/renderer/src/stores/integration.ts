import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type {
  IntegrationTool,
  IntegrationCategory,
  ToolConnection,
  FilterOption,
  ConnectionStatus,
} from "@shared/types/integration";
import { categories, tools } from "./integration.config";
import { integrationApi } from "@renderer/api/integration";

export const useIntegrationStore = defineStore("integration", () => {
  // State
  const allTools = ref<IntegrationTool[]>(tools);
  const allCategories = ref<IntegrationCategory[]>(categories);
  const connections = ref<ToolConnection[]>([]);
  const searchQuery = ref("");
  const filterOption = ref<FilterOption>("all");
  const testingConnectionId = ref<string | null>(null);

  async function loadConnections(): Promise<void> {
    const res = await integrationApi.getConnections();
    if (res.ok) connections.value = res.data;
  }

  // Getters
  const filteredTools = computed(() => {
    let result = allTools.value;

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }

    if (filterOption.value === "connected") {
      result = result.filter((t) => getConnectionStatus(t.id) === "connected");
    }

    return result;
  });

  const toolsByCategory = computed(() => {
    const map = new Map<string, IntegrationTool[]>();
    for (const cat of allCategories.value) {
      map.set(
        cat.id,
        filteredTools.value.filter((t) => t.categoryId === cat.id)
      );
    }
    return map;
  });

  // Helpers
  function resolveConnectionId(toolId: string): string {
    if (toolId.startsWith("yunxiao-")) return "yunxiao";
    return toolId;
  }

  function getConnection(toolId: string): ToolConnection | undefined {
    return connections.value.find((c) => c.toolId === resolveConnectionId(toolId));
  }

  function getConnectionStatus(toolId: string): ConnectionStatus {
    return getConnection(toolId)?.status ?? "not-connected";
  }

  function isToolConnected(toolId: string): boolean {
    return getConnectionStatus(toolId) === "connected";
  }

  // Actions
  function setSearchQuery(query: string): void {
    searchQuery.value = query;
  }

  function setFilterOption(option: FilterOption): void {
    filterOption.value = option;
  }

  async function connectTool(
    toolId: string,
    credentials: Record<string, string>
  ): Promise<{ ok: boolean; error?: string }> {
    const tool = allTools.value.find((t) => t.id === toolId);
    if (!tool || tool.comingSoon) return { ok: false };

    testingConnectionId.value = toolId;
    const res = await integrationApi.connect(toolId, credentials);
    testingConnectionId.value = null;

    if (res.ok) {
      await loadConnections();
      return { ok: true };
    }
    return { ok: false, error: res.error.message };
  }

  async function testConnection(
    toolId: string,
    credentials: Record<string, string>
  ): Promise<boolean> {
    void credentials;
    testingConnectionId.value = toolId;
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    testingConnectionId.value = null;
    return true;
  }

  async function disconnectTool(toolId: string): Promise<void> {
    await integrationApi.disconnect(toolId);
    await loadConnections();
  }

  async function simulateOAuthConnect(toolId: string): Promise<boolean> {
    const tool = allTools.value.find((t) => t.id === toolId);
    if (!tool || tool.comingSoon) return false;

    testingConnectionId.value = toolId;
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    const existing = connections.value.find((c) => c.toolId === toolId);
    if (existing) {
      existing.status = "connected";
      existing.accountName = tool.name;
      existing.connectedAt = new Date().toISOString();
    } else {
      connections.value.push({
        toolId,
        status: "connected",
        accountName: tool.name,
        connectedAt: new Date().toISOString(),
      });
    }

    testingConnectionId.value = null;
    return true;
  }

  return {
    // State
    allCategories,
    searchQuery,
    filterOption,
    testingConnectionId,
    // Getters
    toolsByCategory,
    // Helpers
    getConnection,
    isToolConnected,
    // Actions
    loadConnections,
    setSearchQuery,
    setFilterOption,
    connectTool,
    testConnection,
    disconnectTool,
    simulateOAuthConnect,
  };
});
