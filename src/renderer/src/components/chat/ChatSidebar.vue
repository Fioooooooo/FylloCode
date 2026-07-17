<script setup lang="ts">
import { computed } from "vue";
import { useChatStore, useSessionStore } from "@renderer/stores";
import SessionItem from "./SessionItem.vue";

const sessionStore = useSessionStore();
const chatStore = useChatStore();

const sessions = computed(() => sessionStore.sessions);
const pinnedSessions = computed(() =>
  sortByUpdatedAt(sessions.value.filter((session) => session.isPinned))
);
const recentSessions = computed(() =>
  sortByUpdatedAt(sessions.value.filter((session) => !session.isPinned))
);

function sortByUpdatedAt<T extends { updatedAt: Date }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

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
    <div v-else class="flex flex-1 min-h-0 flex-col py-2" data-test="session-list">
      <template v-if="pinnedSessions.length > 0">
        <section
          class="flex max-h-1/2 shrink-0 flex-col"
          aria-label="置顶会话"
          data-test="pinned-session-group"
        >
          <div class="flex h-8 shrink-0 items-center gap-1.5 px-4 text-xs font-medium text-muted">
            <UIcon name="i-lucide-pin" class="h-3.5 w-3.5" />
            <span>置顶会话</span>
          </div>
          <div class="min-h-0 px-2 overflow-y-auto" data-test="pinned-session-scroll">
            <div class="space-y-1">
              <SessionItem v-for="session in pinnedSessions" :key="session.id" :session="session" />
            </div>
          </div>
        </section>

        <section
          v-if="recentSessions.length > 0"
          class="flex min-h-0 flex-1 flex-col"
          aria-label="最近会话"
          data-test="recent-session-group"
        >
          <div class="flex h-8 shrink-0 items-center px-4 text-xs font-medium text-muted">
            最近会话
          </div>
          <div class="min-h-0 flex-1 px-2 overflow-y-auto" data-test="recent-session-scroll">
            <div class="space-y-1">
              <SessionItem v-for="session in recentSessions" :key="session.id" :session="session" />
            </div>
          </div>
        </section>
      </template>

      <div v-else class="h-full overflow-y-auto" data-test="recent-session-scroll">
        <div class="space-y-1">
          <SessionItem v-for="session in recentSessions" :key="session.id" :session="session" />
        </div>
      </div>
    </div>
  </div>
</template>
