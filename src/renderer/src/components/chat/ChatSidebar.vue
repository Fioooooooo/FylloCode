<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "@renderer/stores/session";
import { useChatStore } from "@renderer/stores";
import SessionItem from "./SessionItem.vue";

const sessionStore = useSessionStore();
const chatStore = useChatStore();

const sessions = computed(() => sessionStore.sessions);

function handleCreateSession(): void {
  sessionStore.beginDraftSession();
  chatStore.resetChatState();
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Session Actions -->
    <div class="p-3 border-b border-default flex items-center">
      <UButton
        color="primary"
        variant="outline"
        icon="i-lucide-plus"
        class="w-full justify-center"
        @click="handleCreateSession"
      >
        新建会话
      </UButton>
    </div>

    <!-- Empty State -->
    <div
      v-if="sessions.length === 0"
      class="flex-1 flex items-center justify-center px-6 text-center"
    >
      <AppEmptyState
        icon="i-lucide-message-square-plus"
        title="暂无会话"
        description="开始新会话以与 Agent 协作"
        action-label="新建会话"
        action-icon="i-lucide-plus"
        compact
        @action="handleCreateSession"
      />
    </div>

    <!-- Session List -->
    <div v-else class="flex-1 overflow-y-auto px-2 py-2">
      <div class="space-y-1">
        <SessionItem v-for="session in sessions" :key="session.id" :session="session" />
      </div>
    </div>
  </div>
</template>
