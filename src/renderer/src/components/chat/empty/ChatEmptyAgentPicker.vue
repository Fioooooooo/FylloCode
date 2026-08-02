<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useAcpAgentsStore, useSessionStore, useWorkspaceStore } from "@renderer/stores";
import AgentPickerModal from "./AgentPickerModal.vue";
import InstalledAgentTile from "./InstalledAgentTile.vue";
import MoreAgentsTile from "./MoreAgentsTile.vue";

const MAX_VISIBLE_INSTALLED = 4;

const acpAgentsStore = useAcpAgentsStore();
const sessionStore = useSessionStore();
const workspaceStore = useWorkspaceStore();
const { registry, statuses, icons, installedAgentIds } = storeToRefs(acpAgentsStore);
const { activeSession, draftAgentId } = storeToRefs(sessionStore);

const modalOpen = ref(false);
const checkingAgentId = ref<string | null>(null);

onMounted(() => {
  if (!acpAgentsStore.initialized && !acpAgentsStore.initializing) {
    void acpAgentsStore.ensureInitialized();
  }
});

const selectedAgentId = computed<string | null>(
  () => activeSession.value?.agentId ?? draftAgentId.value ?? null
);

const targetDirectoryScope = computed(() => {
  const snapshot = activeSession.value?.workspaceSnapshot;
  if (snapshot) {
    return { additionalDirectories: snapshot.additionalDirectories };
  }

  const workspace = workspaceStore.currentWorkspace;
  return {
    additionalDirectories:
      workspace?.availableFolders
        .filter((folder) => folder.folderId !== workspace.primaryFolderId)
        .map((folder) => folder.folderPath) ?? [],
  };
});

const visibleInstalled = computed(() =>
  installedAgentIds.value.slice(0, MAX_VISIBLE_INSTALLED).map((id) => ({
    id,
    name: acpAgentsStore.getAgentLabel(id),
    icon: icons.value[id],
    workspaceCompatibility: acpAgentsStore.getAgentWorkspaceCompatibility(
      id,
      targetDirectoryScope.value
    ),
  }))
);

const hasInstalled = computed(() => installedAgentIds.value.length > 0);
const totalAgents = computed(() => registry.value?.agents.length ?? 0);

async function handleSelect(agentId: string): Promise<void> {
  if (!agentId.startsWith("custom-") && statuses.value[agentId]?.installed !== true) {
    return;
  }

  let compatibility = acpAgentsStore.getAgentWorkspaceCompatibility(
    agentId,
    targetDirectoryScope.value
  );
  if (compatibility === "unsupported") {
    return;
  }
  if (compatibility === "unknown") {
    checkingAgentId.value = agentId;
    try {
      await acpAgentsStore.refreshCapabilities(agentId);
      compatibility = acpAgentsStore.getAgentWorkspaceCompatibility(
        agentId,
        targetDirectoryScope.value
      );
    } finally {
      checkingAgentId.value = null;
    }
    if (compatibility !== "supported") {
      return;
    }
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
  void handleSelect(agentId);
}
</script>

<template>
  <div class="flex h-full items-center justify-center px-6 py-10">
    <div class="w-full max-w-2xl space-y-6">
      <header class="text-center">
        <h2 class="text-[28px] font-bold tracking-tight text-highlighted">
          Pick an Agent to Start
        </h2>
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
          :workspace-compatibility="item.workspaceCompatibility"
          :checking-compatibility="checkingAgentId === item.id"
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
      :requires-additional-directories="targetDirectoryScope.additionalDirectories.length > 0"
      @confirm="handleConfirm"
    />
  </div>
</template>
