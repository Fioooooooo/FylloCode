<script setup lang="ts">
import type { ChatPromptAttachment } from "@renderer/utils/chat-prompt-attachment";
import AttachmentCard from "./AttachmentCard.vue";

defineProps<{
  attachments: ChatPromptAttachment[];
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();
</script>

<template>
  <div
    data-test="attachment-list"
    class="flex items-stretch gap-3 overflow-x-auto pb-1 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    <AttachmentCard
      v-for="attachment in attachments"
      :key="attachment.id"
      :attachment="attachment"
      @remove="emit('remove', $event)"
    />
  </div>
</template>
