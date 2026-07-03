<script lang="ts">
export interface LinkedSessionEntry {
  sessionId: string;
  title: string;
  updatedAt?: Date;
  createdAt?: Date;
  status?: "running" | "ended";
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { getTaskDescriptionSummary } from "@renderer/utils/task";
import { timeAgo } from "@renderer/utils/time";
import type { TaskItem } from "@shared/types/task";

const props = defineProps<{
  task: TaskItem;
  linkedSessions?: LinkedSessionEntry[];
}>();

const emit = defineEmits<{
  "start-discussion": [task: TaskItem];
  "view-detail": [task: TaskItem];
  "open-session": [sessionId: string];
  delete: [task: TaskItem];
}>();

const confirmDialog = useConfirmDialog();
const linkedConversationsOpen = ref(false);

const externalUrl = computed(() => {
  if (props.task.source === "local") {
    return null;
  }

  const meta = props.task.sourceMeta as { url?: string };
  return typeof meta.url === "string" && meta.url ? meta.url : null;
});

const descriptionSummary = computed(() => getTaskDescriptionSummary(props.task));
const linkedSessions = computed(() => props.linkedSessions ?? []);
const linkedSessionCount = computed(() => linkedSessions.value.length);

async function handleDelete(): Promise<void> {
  const confirmed = await confirmDialog({
    title: "删除任务",
    description: "确认删除这条本地任务吗？删除后无法恢复。",
    confirmLabel: "删除",
    confirmColor: "error",
  });

  if (!confirmed) {
    return;
  }

  emit("delete", props.task);
}

function handleViewDetail(): void {
  emit("view-detail", props.task);
}

function handleOpenSession(sessionId: string): void {
  linkedConversationsOpen.value = false;
  emit("open-session", sessionId);
}

function formatEntryTime(entry: LinkedSessionEntry): string {
  const date = entry.updatedAt ?? entry.createdAt;
  if (!date) {
    return "";
  }

  return timeAgo(date);
}
</script>

<template>
  <UiSurface interactive class="flex h-full flex-col">
    <div
      data-role="detail-trigger"
      class="space-y-3 cursor-pointer rounded-md transition-colors hover:text-highlighted"
      @click="handleViewDetail"
    >
      <div class="flex items-center gap-3">
        <h3 class="text-base font-semibold text-highlighted leading-6 truncate flex-1">
          {{ task.title }}
        </h3>
        <span class="text-xs text-muted shrink-0">
          {{ timeAgo(task.createdAt) }}
        </span>
      </div>

      <p
        class="text-sm leading-relaxed line-clamp-2 whitespace-pre-wrap"
        :class="descriptionSummary ? 'text-muted' : 'italic text-muted/70'"
      >
        {{ descriptionSummary || "暂无描述" }}
      </p>

      <div v-if="task.labels.length" class="flex flex-wrap items-center gap-1.5">
        <UBadge
          v-for="label in task.labels"
          :key="label.id"
          color="neutral"
          variant="outline"
          size="xs"
        >
          {{ label.name }}
        </UBadge>
      </div>
    </div>

    <div
      class="mt-auto flex items-center justify-between gap-3 border-t border-default pt-3"
      @click.stop
    >
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-message-circle-more"
          @click.stop="emit('start-discussion', task)"
        >
          发起讨论
        </UButton>

        <UPopover
          v-if="linkedSessionCount > 0"
          v-model:open="linkedConversationsOpen"
          :content="{ align: 'start', side: 'top', sideOffset: 6 }"
          :ui="{ content: 'w-60 p-2' }"
        >
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-messages-square"
            data-test="linked-session-trigger"
            @click.stop
          >
            {{ linkedSessionCount }} 个对话
          </UButton>

          <template #content>
            <div class="flex flex-col gap-1" data-test="linked-session-list">
              <button
                v-for="entry in linkedSessions"
                :key="entry.sessionId"
                type="button"
                class="w-full text-left rounded-md px-2 py-1.5 transition-colors hover:bg-elevated"
                :data-test="`linked-session-item-${entry.sessionId}`"
                @click.stop="handleOpenSession(entry.sessionId)"
              >
                <div class="truncate text-sm font-medium text-highlighted">
                  {{ entry.title || entry.sessionId }}
                </div>
                <div v-if="formatEntryTime(entry)" class="text-xs text-muted">
                  {{ formatEntryTime(entry) }}
                </div>
              </button>
            </div>
          </template>
        </UPopover>

        <UButton
          v-if="externalUrl"
          as="a"
          :href="externalUrl"
          target="_blank"
          rel="noreferrer"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-external-link"
        >
          任务来源
        </UButton>
      </div>

      <UButton
        v-if="task.source === 'local'"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-trash-2"
        title="删除任务"
        class="text-muted transition-colors hover:bg-error/10 hover:text-error"
        @click.stop="void handleDelete()"
      />
    </div>
  </UiSurface>
</template>
