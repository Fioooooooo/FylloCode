<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { useSessionStore } from "@renderer/stores/session";
import AgentPickerModal from "./AgentPickerModal.vue";
import InstalledAgentTile from "./InstalledAgentTile.vue";
import MoreAgentsTile from "./MoreAgentsTile.vue";

const MAX_VISIBLE_INSTALLED = 4;

const acpAgentsStore = useAcpAgentsStore();
const sessionStore = useSessionStore();
const { registry, statuses, icons, installedAgentIds } = storeToRefs(acpAgentsStore);
const { activeSession, draftAgentId } = storeToRefs(sessionStore);

const modalOpen = ref(false);

onMounted(() => {
  if (!acpAgentsStore.initialized && !acpAgentsStore.initializing) {
    void acpAgentsStore.ensureInitialized();
  }
});

const selectedAgentId = computed<string | null>(
  () => activeSession.value?.agentId ?? draftAgentId.value ?? null
);

const visibleInstalled = computed(() =>
  installedAgentIds.value.slice(0, MAX_VISIBLE_INSTALLED).map((id) => ({
    id,
    name: acpAgentsStore.getAgentLabel(id),
    icon: icons.value[id],
  }))
);

const hasInstalled = computed(() => installedAgentIds.value.length > 0);
const totalAgents = computed(() => registry.value?.agents.length ?? 0);

function handleSelect(agentId: string): void {
  if (!agentId.startsWith("custom-") && statuses.value[agentId]?.installed !== true) {
    return;
  }

  if (activeSession.value) {
    void sessionStore.setSessionAgent(agentId).catch((error: unknown) => {
      console.error("Failed to set session agent:", error);
    });
    return;
  }

  sessionStore.setDraftAgent(agentId);
}

function openModal(): void {
  modalOpen.value = true;
}

function handleConfirm(agentId: string): void {
  handleSelect(agentId);
}
</script>

<template>
  <div class="flex h-full items-center justify-center px-6 py-10">
    <div class="w-full max-w-2xl space-y-6">
      <header class="text-center">
        <h2 class="text-2xl font-semibold text-highlighted">Pick an Agent to Start</h2>
        <p class="mt-1 text-sm text-muted">选择一个 Agent 开始你的会话</p>
      </header>

      <div v-if="hasInstalled" class="flex justify-center items-center gap-3">
        <InstalledAgentTile
          v-for="item in visibleInstalled"
          :key="item.id"
          :agent-id="item.id"
          :name="item.name"
          :icon="item.icon"
          :selected="selectedAgentId === item.id"
          @select="handleSelect"
        />
        <MoreAgentsTile variant="more" :total-count="totalAgents" @click="openModal" />
      </div>

      <div v-else class="flex justify-center">
        <div class="w-full max-w-sm">
          <MoreAgentsTile variant="promo" :total-count="totalAgents" @click="openModal" />
        </div>
      </div>
    </div>

    <AgentPickerModal
      v-model:open="modalOpen"
      :current-agent-id="selectedAgentId"
      @confirm="handleConfirm"
    />
  </div>
</template>
