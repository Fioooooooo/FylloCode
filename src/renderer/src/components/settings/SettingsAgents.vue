<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import AgentCard from "./AgentCard.vue";

const store = useAcpAgentsStore();
const refreshing = ref(false);
const searchQuery = ref("");
const activeTab = ref("all");

const tabs = [
  { label: "全部", value: "all" },
  { label: "已安装", value: "installed" },
];

const agents = computed(() => store.registry?.agents ?? []);
const currentMutatingAgentId = computed(() => {
  const installing = Object.values(store.installProgress).find(
    (progress) => progress.status === "downloading" || progress.status === "installing"
  )?.agentId;
  if (installing) {
    return installing;
  }

  return (
    Object.values(store.uninstallProgress).find((progress) => progress.status === "uninstalling")
      ?.agentId ?? null
  );
});
const hasRegistryError = computed(
  () =>
    !store.registryLoading &&
    !agents.value.length &&
    !!(store.initializationError || store.registryError)
);

const filteredAgents = computed(() => {
  let result = agents.value;
  if (activeTab.value === "installed") {
    result = result.filter((a) => store.statuses[a.id]?.installed);
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    result = result.filter((a) => a.name.toLowerCase().includes(q));
  }
  return result;
});

onMounted(() => {
  if (!store.initialized && !store.initializing) {
    void store.ensureInitialized();
  }
});

async function refreshStatuses(): Promise<void> {
  refreshing.value = true;
  try {
    await store.refreshAll();
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">ACP Agents</h2>
        <p class="text-sm text-muted mt-0.5">支持 Agent Client Protocol 的 CLI Agent。</p>
      </div>
      <UButton
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-refresh-cw"
        :loading="refreshing"
        @click="refreshStatuses"
      >
        刷新
      </UButton>
    </div>

    <div class="flex items-center gap-3 mb-4">
      <UInput
        v-model="searchQuery"
        size="sm"
        placeholder="搜索 Agent..."
        icon="i-lucide-search"
        class="flex-1"
      />
      <UTabs v-model="activeTab" :items="tabs" size="sm" variant="link" value-key="value" />
    </div>

    <div
      v-if="store.registryLoading && !agents.length"
      class="flex items-center justify-center py-16"
    >
      <UIcon name="i-lucide-loader-circle" class="w-6 h-6 text-muted animate-spin" />
    </div>

    <div v-else-if="hasRegistryError" class="flex items-center justify-center py-16">
      <p class="text-sm text-muted">{{ store.registryError }}</p>
    </div>

    <template v-else>
      <div v-if="filteredAgents.length" class="grid grid-cols-2 gap-4">
        <AgentCard
          v-for="agent in filteredAgents"
          :key="agent.id"
          :agent="agent"
          :icon="store.icons[agent.id]"
          :agent-status="store.statuses[agent.id]"
          :install-progress="store.installProgress[agent.id] ?? store.uninstallProgress[agent.id]"
          :user-data-path="store.userDataPath"
          :is-installing="currentMutatingAgentId === agent.id"
          :action-disabled="!!currentMutatingAgentId && currentMutatingAgentId !== agent.id"
          @install="store.installAgent"
          @uninstall="store.uninstallAgent"
        />
      </div>
      <div v-else class="flex items-center justify-center py-16">
        <p class="text-sm text-muted">没有匹配的 Agent</p>
      </div>
    </template>
  </div>
</template>
