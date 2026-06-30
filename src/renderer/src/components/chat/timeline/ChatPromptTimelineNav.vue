<script setup lang="ts">
import { ref } from "vue";
import type { ChatPromptTimelineItem } from "@renderer/utils/chat-prompt-timeline";

const props = defineProps<{
  items: ChatPromptTimelineItem[];
  activeItemId: string | null;
}>();

const emit = defineEmits<{
  "locate-prompt": [messageId: string];
}>();

const openItemId = ref<string | null>(null);

function isActive(item: ChatPromptTimelineItem): boolean {
  return props.activeItemId === item.id;
}

function openPreview(itemId: string): void {
  openItemId.value = itemId;
}

function closePreview(itemId: string): void {
  if (openItemId.value === itemId) {
    openItemId.value = null;
  }
}
</script>

<template>
  <nav
    class="flex w-9 flex-col items-center overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    aria-label="User prompt timeline"
    data-test="chat-prompt-timeline"
  >
    <div class="flex min-h-full flex-col items-start gap-1">
      <UPopover
        v-for="item in props.items"
        :key="item.id"
        :open="openItemId === item.id"
        :content="{ align: 'start', side: 'right', sideOffset: 8 }"
        :ui="{ content: 'w-72 p-3' }"
        :portal="false"
        :disable-hoverable-content="true"
        :ignore-non-keyboard-focus="true"
        @update:open="openItemId = $event ? item.id : null"
      >
        <template #default>
          <button
            type="button"
            class="h-1 w-5 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-primary"
            :class="isActive(item) ? 'bg-neutral-900 w-7' : 'bg-accented'"
            :aria-label="`定位到第 ${item.index} 条 user prompt`"
            :aria-current="isActive(item) ? 'true' : undefined"
            :data-state="isActive(item) ? 'active' : 'inactive'"
            data-test="chat-prompt-timeline-item"
            @click="emit('locate-prompt', item.messageId)"
            @mouseenter="openPreview(item.id)"
            @mouseleave="closePreview(item.id)"
            @focus="openPreview(item.id)"
            @blur="closePreview(item.id)"
          ></button>
        </template>

        <template #content>
          <div
            class="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-5 text-default"
            data-test="chat-prompt-timeline-preview"
          >
            {{ item.preview }}
          </div>
        </template>
      </UPopover>
    </div>
  </nav>
</template>
