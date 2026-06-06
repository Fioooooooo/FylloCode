<script setup lang="ts">
import type { ChatPromptAttachment } from "@renderer/utils/chat-prompt-attachment";

defineProps<{
  attachment: ChatPromptAttachment;
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();
</script>

<template>
  <div
    v-if="attachment.isImage"
    data-test="attachment-image-card"
    class="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-default bg-elevated/60"
  >
    <img
      :src="attachment.previewUrl ?? undefined"
      :alt="attachment.name"
      class="h-full w-full object-cover"
    />

    <UButton
      variant="ghost"
      color="neutral"
      size="xs"
      icon="i-lucide-x"
      class="inline-flex items-center justify-center absolute right-0.5 top-0.5 size-4 rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
      :aria-label="`移除 ${attachment.name}`"
      :ui="{ leadingIcon: 'size-3' }"
      @click="emit('remove', attachment.id)"
    />
  </div>

  <div
    v-else
    data-test="attachment-file-card"
    class="group relative flex h-14 min-w-64 shrink-0 items-center gap-3 rounded-md border border-default bg-elevated/45 p-2"
  >
    <div
      class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
    >
      <UIcon name="i-lucide-file" class="h-5 w-5" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-highlighted">{{ attachment.name }}</p>
      <div class="flex items-center gap-2 text-xs text-muted">
        <span>{{ attachment.sizeLabel }}</span>
      </div>
    </div>

    <UButton
      variant="ghost"
      color="neutral"
      size="xs"
      icon="i-lucide-x"
      class="inline-flex items-center justify-center absolute right-0.5 top-0.5 size-4 rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
      :aria-label="`移除 ${attachment.name}`"
      :ui="{ leadingIcon: 'size-3' }"
      @click="emit('remove', attachment.id)"
    />
  </div>
</template>
