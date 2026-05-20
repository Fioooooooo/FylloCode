<script setup lang="ts">
import { computed, toRef } from "vue";
import { useSessionStore } from "@renderer/stores/session";
import type { Session } from "@shared/types/chat";
import { useChatStore } from "@renderer/stores";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";

const props = defineProps<{
  session: Session;
}>();

const sessionStore = useSessionStore();
const chatStore = useChatStore();
const acpAgentsStore = useAcpAgentsStore();

const session = toRef(props, "session");
const active = computed(() => sessionStore.activeSessionId === session.value.id);
const agentIcon = computed(() => acpAgentsStore.icons[session.value.agentId] ?? null);

const menuItems = computed(() => [
  {
    label: "重命名",
    icon: "i-lucide-pencil",
    onSelect: (): void => {
      void handleRename().catch((error: unknown) => {
        console.error("Failed to rename session:", error);
      });
    },
  },
  {
    label: "删除",
    icon: "i-lucide-trash-2",
    color: "error" as const,
    onSelect: (): void => {
      void handleDelete().catch((error: unknown) => {
        console.error("Failed to delete session:", error);
      });
    },
  },
]);

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } else if (days === 1) {
    return "Yesterday";
  } else {
    return `${days}d ago`;
  }
}

async function handleSelect(): Promise<void> {
  chatStore.resetChatState();
  await sessionStore.selectSession(session.value.id);
}

async function handleRename(): Promise<void> {
  const newTitle = prompt("Rename session:", session.value.title);
  if (newTitle && newTitle.trim()) {
    await sessionStore.renameSession(session.value.id, newTitle.trim());
  }
}

async function handleDelete(): Promise<void> {
  if (confirm("Are you sure you want to delete this session?")) {
    await sessionStore.deleteSession(session.value.id);
  }
}
</script>

<template>
  <div
    class="group relative flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
    :class="active ? 'bg-primary/8' : 'hover:bg-muted/60'"
    @click="
      void handleSelect().catch((error: unknown) => {
        console.error('Failed to select session:', error);
      })
    "
  >
    <div
      class="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-muted"
      data-test="session-media"
    >
      <span
        v-if="session.status === 'running'"
        class="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-success/80 animate-pulse"
        data-test="session-running-indicator"
      />

      <img
        v-if="agentIcon"
        :src="agentIcon"
        :alt="`${session.agentId} icon`"
        class="h-full w-full object-cover"
        data-test="session-agent-icon"
      />
      <UIcon
        v-else
        name="i-lucide-bot"
        class="h-3.5 w-3.5"
        data-test="session-agent-icon-fallback"
      />
    </div>

    <div class="min-w-0 flex-1 pr-8">
      <div
        class="truncate text-sm font-medium leading-5 text-highlighted"
        data-test="session-title"
      >
        {{ session.title }}
      </div>
      <div
        class="mt-1 flex items-center gap-1 text-xs leading-4 text-muted"
        data-test="session-meta"
      >
        <span>{{ formatTime(session.updatedAt) }}</span>
        <span>·</span>
        <span>{{ session.turnCount }} turns</span>
      </div>
    </div>

    <div
      class="absolute top-2 right-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      @click.stop
    >
      <UDropdownMenu :items="menuItems">
        <UButton variant="ghost" color="neutral" size="xs" class="text-muted" @click.stop>
          <UIcon name="i-lucide-more-vertical" class="w-4 h-4" />
        </UButton>
      </UDropdownMenu>
    </div>
  </div>
</template>
