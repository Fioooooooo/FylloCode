<script setup lang="ts">
import { computed, nextTick, ref, toRef } from "vue";
import { useSessionStore, useAcpAgentsStore } from "@renderer/stores";
import type { Session } from "@shared/types/chat";
import CustomAgentIcon from "@renderer/components/acp/CustomAgentIcon.vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { useOpenChatSession } from "@renderer/composables/useOpenChatSession";
import { useSessionAttention } from "@renderer/features/fyllo-action";

const props = defineProps<{
  session: Session;
}>();

const sessionStore = useSessionStore();
const { openChatSession } = useOpenChatSession();
const acpAgentsStore = useAcpAgentsStore();
const confirmDialog = useConfirmDialog();

const TASK_SOURCE_LABELS: Record<string, string> = {
  local: "本地",
  yunxiao: "云效",
  github: "GitHub",
};

const session = toRef(props, "session");
const { attentionCount, displayCount, hasAttention } = useSessionAttention(session);
const active = computed(() => sessionStore.activeSessionId === session.value.id);
const agentIcon = computed(() => acpAgentsStore.icons[session.value.agentId] ?? null);
const originTaskSourceLabel = computed(() => {
  const source = session.value.originTaskRef?.split(":")[0];
  return source ? (TASK_SOURCE_LABELS[source] ?? null) : null;
});
const originTaskPopoverOpen = ref(false);
const originTaskLoading = ref(false);
const originTaskInfo = computed(
  () => sessionStore.taskInfoBySessionId.get(session.value.id) ?? null
);
const originTaskTitle = computed(
  () => originTaskInfo.value?.title ?? session.value.originTaskRef ?? ""
);
const isEditingTitle = ref(false);
const titleDraft = ref("");
const titleInputRef = ref<HTMLInputElement | null>(null);
const menuOpen = ref(false);

const menuItems = computed(() => [
  {
    label: "修改标题",
    icon: "i-lucide-pencil",
    onSelect: (): void => {
      startTitleEdit();
    },
  },
  {
    label: session.value.isPinned ? "取消置顶" : "置顶会话",
    icon: session.value.isPinned ? "i-lucide-pin-off" : "i-lucide-pin",
    onSelect: (): void => {
      void handleSetPinned().catch((error: unknown) => {
        console.error("Failed to update session pin:", error);
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
  await openChatSession(session.value.id);
}

function startTitleEdit(): void {
  titleDraft.value = session.value.title;
  isEditingTitle.value = true;
  void nextTick(() => {
    titleInputRef.value?.focus();
    titleInputRef.value?.select();
  });
}

async function commitTitleEdit(): Promise<void> {
  if (!isEditingTitle.value) {
    return;
  }

  const trimmedTitle = titleDraft.value.trim();
  isEditingTitle.value = false;

  if (!trimmedTitle || trimmedTitle === session.value.title) {
    return;
  }

  await sessionStore.renameSession(session.value.id, trimmedTitle);
}

function cancelTitleEdit(): void {
  isEditingTitle.value = false;
  titleDraft.value = session.value.title;
}

async function handleDelete(): Promise<void> {
  const confirmed = await confirmDialog({
    title: "删除会话？",
    description: `会话“${session.value.title}”将从历史记录中永久删除，且不可撤销。`,
    confirmLabel: "删除会话",
    confirmColor: "error",
  });

  if (confirmed) {
    await sessionStore.deleteSession(session.value.id);
  }
}

async function handleSetPinned(): Promise<void> {
  await sessionStore.setSessionPinned(session.value.id, !session.value.isPinned);
}

async function handleOriginTaskEnter(): Promise<void> {
  if (!session.value.originTaskRef) {
    return;
  }

  originTaskPopoverOpen.value = true;
  if (originTaskInfo.value) {
    return;
  }

  originTaskLoading.value = true;
  try {
    await sessionStore.ensureSessionOriginTaskInfo(session.value);
  } finally {
    originTaskLoading.value = false;
  }
}

function handleOriginTaskLeave(): void {
  originTaskPopoverOpen.value = false;
}
</script>

<template>
  <div
    class="group relative flex h-12 cursor-pointer items-center rounded-lg px-3 transition-colors"
    :class="active ? 'bg-primary/15' : 'hover:bg-elevated'"
    @click="
      void handleSelect().catch((error: unknown) => {
        console.error('Failed to select session:', error);
      })
    "
  >
    <div
      class="pointer-events-none absolute inset-y-0 right-0 z-0 flex w-20 items-center justify-end overflow-hidden rounded-r-lg [mask-image:linear-gradient(to_right,transparent_0%,black_55%)]"
      role="img"
      :aria-label="`${session.agentId} icon`"
      data-test="session-media"
    >
      <img
        v-if="agentIcon"
        :src="agentIcon"
        alt=""
        aria-hidden="true"
        class="h-full w-16 object-contain object-right brightness-0 opacity-[0.08] dark:invert dark:opacity-[0.12]"
        data-test="session-agent-icon"
      />
      <CustomAgentIcon
        v-else
        aria-hidden="true"
        class="h-full w-16 brightness-0 opacity-[0.08] dark:invert dark:opacity-[0.12]"
        data-test="session-agent-icon-fallback"
      />
    </div>

    <div class="relative z-10 min-w-0 flex-1" data-test="session-content">
      <div class="flex min-w-0 items-center gap-1.5" data-test="session-title-row">
        <span
          v-if="session.status === 'running'"
          class="h-2 w-2 shrink-0 rounded-full bg-success/80 animate-pulse"
          data-test="session-running-indicator"
        />
        <div
          v-if="!isEditingTitle"
          class="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-highlighted"
          data-test="session-title"
        >
          {{ session.title }}
        </div>
        <input
          v-else
          ref="titleInputRef"
          v-model="titleDraft"
          class="h-5 min-w-0 flex-1 rounded-md border border-default bg-default px-1.5 text-sm font-medium leading-5 text-highlighted outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          data-test="session-title-input"
          @click.stop
          @blur="
            void commitTitleEdit().catch((error: unknown) => {
              console.error('Failed to rename session:', error);
            })
          "
          @keydown.enter.prevent="
            void commitTitleEdit().catch((error: unknown) => {
              console.error('Failed to rename session:', error);
            })
          "
          @keydown.escape.stop.prevent="cancelTitleEdit"
        />
      </div>
      <div class="flex items-center gap-1 text-xs leading-4 text-muted" data-test="session-meta">
        <span>{{ formatTime(session.updatedAt) }}</span>
        <span>·</span>
        <span>{{ session.turnCount }} turns</span>
        <template v-if="session.originTaskRef">
          <span>·</span>
          <UPopover
            :open="originTaskPopoverOpen"
            :content="{ align: 'center', side: 'top', sideOffset: 6 }"
            :ui="{ content: 'w-56 p-3' }"
            @update:open="originTaskPopoverOpen = $event"
          >
            <template #default>
              <span
                class="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                aria-label="查看关联任务"
                data-test="session-origin-task-indicator"
                @mouseenter="
                  void handleOriginTaskEnter().catch((error: unknown) => {
                    console.error('Failed to load origin task info:', error);
                  })
                "
                @mouseleave="handleOriginTaskLeave"
              >
                <UIcon name="i-lucide-clipboard-check" class="h-3.5 w-3.5" />
              </span>
            </template>

            <template #content>
              <div
                class="flex min-w-0 flex-col gap-1"
                data-test="session-origin-task-popover"
                @mouseenter="originTaskPopoverOpen = true"
                @mouseleave="handleOriginTaskLeave"
              >
                <div
                  class="flex items-center gap-1.5 text-xs text-muted"
                  data-test="session-origin-task-source"
                >
                  <UIcon name="i-lucide-clipboard-check" class="h-3.5 w-3.5 shrink-0" />
                  <span>{{ originTaskSourceLabel }}</span>
                </div>
                <div
                  class="min-w-0 truncate text-sm font-medium text-highlighted"
                  data-test="session-origin-task-title"
                >
                  {{ originTaskLoading && !originTaskInfo ? "正在加载任务…" : originTaskTitle }}
                </div>
              </div>
            </template>
          </UPopover>
        </template>
        <div v-if="hasAttention" class="ml-auto shrink-0">
          <UTooltip :text="`该会话有 ${attentionCount} 个待处理操作`" :delay-duration="200">
            <UBadge
              color="primary"
              variant="solid"
              size="xs"
              class="h-4 min-w-4 justify-center px-1 text-[10px] leading-4"
              :aria-label="`该会话有 ${attentionCount} 个待处理操作`"
              data-test="session-attention-badge"
            >
              <span data-test="session-attention-count">{{ displayCount }}</span>
            </UBadge>
          </UTooltip>
        </div>
      </div>
    </div>

    <div
      class="absolute top-2 right-2 z-20 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-hover:bg-muted group-active:bg-muted rounded-md"
      :class="menuOpen ? 'opacity-100' : null"
      @click.stop
    >
      <UDropdownMenu v-model:open="menuOpen" :items="menuItems" @click.stop>
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          class="h-7 w-7 text-muted"
          aria-label="会话操作"
          @click.stop
        >
          <UIcon name="i-lucide-more-vertical" class="w-4 h-4" />
        </UButton>
      </UDropdownMenu>
    </div>
  </div>
</template>
