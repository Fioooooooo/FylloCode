<script setup lang="ts">
import type { UIMessage } from "ai";
import { isTextUIPart } from "ai";
import { useUserImagePart } from "@renderer/composables/useUserImagePart";
import { isUserFilePart, isUserImagePart } from "@renderer/utils/chat-message-parts";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";

const props = defineProps<{
  message: UIMessage;
}>();

const { getImageSrc } = useUserImagePart({
  messageId: () => props.message.id,
  parts: () => props.message.parts,
});

function getFilePartName(part: UIMessage["parts"][number]): string {
  const value = (part as { filename?: unknown }).filename;
  return typeof value === "string" ? value : "附件";
}

function getFilePartExtension(part: UIMessage["parts"][number]): string {
  const filename = getFilePartName(part);
  const extension = filename.includes(".") ? filename.split(".").at(-1) : "";
  return extension ? extension.toUpperCase() : "FILE";
}
</script>

<template>
  <div class="flex max-w-full flex-col items-end gap-2">
    <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
      <p
        v-if="isTextUIPart(part) && !isSystemReminderPart(part)"
        class="whitespace-pre-wrap wrap-anywhere relative text-pretty px-4 py-3 rounded-lg min-h-12 bg-elevated/50 border border-default"
      >
        {{ part.text }}
      </p>

      <div
        v-else-if="isUserImagePart(part)"
        data-test="user-message-image-card"
        class="relative h-32 w-32 overflow-hidden rounded-lg border border-default bg-elevated/50"
      >
        <img
          :src="getImageSrc(index)"
          :alt="getFilePartName(part)"
          class="h-full w-full object-cover"
        />
      </div>

      <div
        v-else-if="isUserFilePart(part)"
        data-test="user-message-file-card"
        class="flex min-w-64 max-w-full items-center gap-3 rounded-lg border border-default bg-elevated/50 p-2"
      >
        <div
          class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <UIcon name="i-lucide-file" class="h-5 w-5" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ getFilePartName(part) }}
          </p>
          <div class="flex items-center gap-2 text-xs text-muted">
            <span>{{ getFilePartExtension(part) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
