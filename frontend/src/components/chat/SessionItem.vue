<script setup lang="ts">
import { computed, toRef } from "vue";
import { useSessionStore } from "@renderer/stores/session";
import type { Session } from "@shared/types/chat";
import { useChatStore } from "@renderer/stores";

const props = defineProps<{
  session: Session;
}>();

const sessionStore = useSessionStore();
const chatStore = useChatStore();

const session = toRef(props, "session");
const active = computed(() => sessionStore.activeSessionId === session.value.id);

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
  await sessionStore.selectSession(session.value.id);
  chatStore.chatStatus = "ready";
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
    class="group relative flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-default/50 last:border-b-0"
    :class="active ? 'bg-primary/5' : 'hover:bg-muted/50'"
    @click="
      void handleSelect().catch((error: unknown) => {
        console.error('Failed to select session:', error);
      })
    "
  >
    <div class="mt-1.5 shrink-0">
      <span
        class="w-2 h-2 rounded-full block"
        :class="
          session.status === 'running'
            ? 'bg-success animate-pulse'
            : 'bg-neutral-300 dark:bg-neutral-600'
        "
      />
    </div>

    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate text-highlighted">
        {{ session.title }}
      </div>
      <div class="text-xs text-muted mt-0.5 flex items-center gap-1">
        <span>{{ formatTime(session.updatedAt) }}</span>
        <span>·</span>
        <span>{{ session.turnCount }} turns</span>
      </div>
    </div>

    <div class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click.stop>
      <UDropdownMenu :items="menuItems">
        <UButton variant="ghost" color="neutral" size="xs" class="text-muted" @click.stop>
          <UIcon name="i-lucide-more-vertical" class="w-4 h-4" />
        </UButton>
      </UDropdownMenu>
    </div>
  </div>
</template>
