<script setup lang="ts">
import { computed } from "vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { getTaskDescriptionSummary } from "@renderer/utils/task";
import { timeAgo } from "@renderer/utils/time";
import type { TaskItem } from "@shared/types/task";

const props = defineProps<{
  task: TaskItem;
}>();

const emit = defineEmits<{
  "start-discussion": [task: TaskItem];
  "view-detail": [task: TaskItem];
  delete: [task: TaskItem];
}>();

const confirmDialog = useConfirmDialog();

const externalUrl = computed(() => {
  if (props.task.source === "local") {
    return null;
  }

  const meta = props.task.sourceMeta as { url?: string };
  return typeof meta.url === "string" && meta.url ? meta.url : null;
});

const descriptionSummary = computed(() => getTaskDescriptionSummary(props.task));

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
</script>

<template>
  <div
    class="flex h-full flex-col rounded-lg border border-default bg-elevated px-4 py-4 space-y-3 transition-colors hover:border-accented"
  >
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

        <UButton
          v-if="task.proposalId"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-link"
          :title="`Proposal #${task.proposalId}`"
        >
          关联 Proposal
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
  </div>
</template>
