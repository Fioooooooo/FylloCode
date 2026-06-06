<script setup lang="ts">
import { computed } from "vue";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta } from "@shared/types/proposal";
import type { UIMessage } from "ai";

const props = defineProps<{
  runMeta: ApplyRunMeta | null;
  messages: UIMessage<MessageMeta>[];
  isStreaming: boolean;
}>();

defineEmits<{
  close: [];
}>();

const panelTitle = computed(() => props.runMeta?.workflowId ?? "运行历史");
const showEmptyState = computed(() => !props.isStreaming && props.messages.length === 0);

function getStageIndex(): number {
  if (!props.runMeta || props.runMeta.stages.length === 0) {
    return 0;
  }

  return Math.min(props.runMeta.currentStageIndex, props.runMeta.stages.length - 1);
}

function getStageCount(): number {
  return props.runMeta?.stages.length ?? 0;
}
</script>

<template>
  <div class="flex flex-col w-96 shrink-0 border-l border-default bg-default overflow-hidden">
    <div class="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-default">
      <div class="flex items-center gap-2 min-w-0">
        <span v-if="runMeta" class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
        <UIcon v-else name="i-lucide-history" class="w-4 h-4 text-muted shrink-0" />
        <span class="text-sm font-medium text-highlighted truncate">{{ panelTitle }}</span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <span v-if="runMeta" class="text-xs text-muted">
          {{ getStageCount() > 0 ? getStageIndex() + 1 : 0 }}/{{ getStageCount() }}
        </span>
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-x"
          @click="$emit('close')"
        />
      </div>
    </div>

    <div v-if="runMeta" class="shrink-0 px-4 py-2 border-b border-default bg-elevated/50">
      <div class="flex items-center gap-1.5">
        <template v-for="(stage, index) in runMeta.stages" :key="stage.id">
          <div
            class="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            :class="
              index < getStageIndex()
                ? 'bg-success/10 text-success'
                : index === getStageIndex()
                  ? 'bg-warning/10 text-warning font-medium'
                  : 'bg-elevated text-muted'
            "
          >
            <UIcon v-if="index < getStageIndex()" name="i-lucide-check" class="w-3 h-3" />
            <span
              v-else-if="index === getStageIndex()"
              class="w-1.5 h-1.5 rounded-full bg-current"
            />
            <span>{{ stage.name }}</span>
          </div>
          <UIcon
            v-if="index < runMeta.stages.length - 1"
            name="i-lucide-chevron-right"
            class="w-3 h-3 text-muted shrink-0"
          />
        </template>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-3">
      <div
        v-if="showEmptyState"
        class="flex h-full min-h-52 items-center justify-center rounded-lg border border-dashed border-default bg-elevated/20 px-6"
      >
        <div class="flex max-w-64 flex-col items-center text-center">
          <div class="mb-3 rounded-full bg-elevated p-3 text-muted">
            <UIcon name="i-lucide-history" class="w-5 h-5" />
          </div>
          <p class="text-sm font-medium text-highlighted">暂无运行记录</p>
          <p class="mt-1 text-xs leading-5 text-muted">这个 proposal 还没有可查看的历史日志。</p>
        </div>
      </div>

      <ChatMessageList
        v-else
        :messages="messages"
        :status="isStreaming ? 'streaming' : 'ready'"
        type="side"
      />
    </div>
  </div>
</template>
