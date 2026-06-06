<script setup lang="ts">
import { computed, ref } from "vue";
import { useSessionStore } from "@renderer/stores/session";
import { useChatStore } from "@renderer/stores";
import SessionItem from "./SessionItem.vue";

const sessionStore = useSessionStore();
const chatStore = useChatStore();

const sessions = computed(() => sessionStore.sessions);
const searchQuery = ref("");

function handleCreateSession(): void {
  sessionStore.beginDraftSession();
  chatStore.resetChatState();
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Search Bar -->
    <div class="p-3 border-b border-default flex items-center gap-2">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="搜索会话..."
        size="sm"
        class="flex-1"
      />
      <UButton
        color="primary"
        variant="subtle"
        size="sm"
        class="shrink-0"
        @click="handleCreateSession"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
      </UButton>
    </div>

    <!-- Empty State -->
    <div
      v-if="sessions.length === 0"
      class="flex-1 flex items-center justify-center px-6 text-center"
    >
      <p class="text-sm text-muted">开始新会话以与 Agent 协作</p>
    </div>

    <!-- Session List -->
    <div v-else class="flex-1 overflow-y-auto px-2 py-2">
      <div class="space-y-1">
        <SessionItem v-for="session in sessions" :key="session.id" :session="session" />
      </div>
    </div>
  </div>
</template>
