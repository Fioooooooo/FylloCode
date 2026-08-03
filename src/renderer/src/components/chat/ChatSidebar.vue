<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useChatStore, useSessionStore } from "@renderer/stores";
import type { Session } from "@shared/types/chat";
import SessionItem from "./SessionItem.vue";

type SessionGroupId = "pinned" | "recent";

interface SessionGroup {
  id: SessionGroupId;
  label: string;
  icon: string;
  sessions: Session[];
}

const sessionStore = useSessionStore();
const chatStore = useChatStore();

const sessions = computed(() => sessionStore.sessions);
const pinnedSessions = computed(() =>
  sortByUpdatedAt(sessions.value.filter((session) => session.isPinned))
);
const recentSessions = computed(() =>
  sortByUpdatedAt(sessions.value.filter((session) => !session.isPinned))
);
const groupOpenById = reactive<Record<SessionGroupId, boolean>>({
  pinned: true,
  recent: true,
});
const sessionGroups = computed<SessionGroup[]>(() => {
  const groups: SessionGroup[] = [];

  if (pinnedSessions.value.length > 0) {
    groups.push({
      id: "pinned",
      label: "置顶会话",
      icon: "i-lucide-pin",
      sessions: pinnedSessions.value,
    });
  }

  if (recentSessions.value.length > 0) {
    groups.push({
      id: "recent",
      label: "最近会话",
      icon: "i-lucide-clock-3",
      sessions: recentSessions.value,
    });
  }

  return groups;
});
const activeGroupId = computed<SessionGroupId | null>(() => {
  const activeSession = sessionStore.activeSession;
  if (!activeSession) {
    return null;
  }

  return activeSession.isPinned ? "pinned" : "recent";
});

watch(activeGroupId, (groupId, previousGroupId) => {
  if (groupId && groupId !== previousGroupId) {
    groupOpenById[groupId] = true;
  }
});

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
      <UCollapsible
        v-for="group in sessionGroups"
        :key="group.id"
        v-model:open="groupOpenById[group.id]"
        as="section"
        :unmount-on-hide="false"
        class="flex min-h-0 basis-8 shrink-0 flex-col overflow-hidden transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none"
        :class="groupOpenById[group.id] ? 'grow' : 'grow-0'"
        :aria-label="group.label"
        :data-test="`${group.id}-session-group`"
        :ui="{
          content:
            'flex min-h-0 flex-1 flex-col overflow-hidden data-[state=open]:animate-none data-[state=closed]:animate-none',
        }"
      >
        <template #default="{ open }">
          <UButton
            color="neutral"
            variant="ghost"
            class="h-8 w-full shrink-0 justify-start rounded-none px-4 text-xs font-medium text-muted transition-colors hover:bg-transparent hover:text-highlighted"
            :aria-label="`${open ? '折叠' : '展开'}${group.label}`"
            :data-test="`${group.id}-session-trigger`"
          >
            <UIcon :name="group.icon" class="h-3.5 w-3.5 shrink-0" />
            <span>{{ group.label }}</span>
            <span class="text-dimmed" :data-test="`${group.id}-session-count`">
              {{ group.sessions.length }}
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-150"
              :class="open ? 'rotate-180' : null"
            />
          </UButton>
        </template>

        <template #content>
          <div class="min-h-0 flex-1 overflow-y-auto" :data-test="`${group.id}-session-scroll`">
            <div class="space-y-1 px-2">
              <SessionItem v-for="session in group.sessions" :key="session.id" :session="session" />
            </div>
          </div>
        </template>
      </UCollapsible>
    </div>
  </div>
</template>
