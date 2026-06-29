<script setup lang="ts">
import { isTextUIPart, type UIMessage } from "ai";
import { useToast } from "@nuxt/ui/composables";
import { computed, onBeforeUnmount, ref } from "vue";
import type { MessageMeta } from "@shared/types/chat";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";

const props = defineProps<{
  message: UIMessage<MessageMeta>;
}>();

const toast = useToast();
const copied = ref(false);
let copiedTimer: number | null = null;

const actionLabel = computed(() => (copied.value ? "已复制" : "复制消息"));
const actionIcon = computed(() => (copied.value ? "i-lucide-check" : "i-lucide-copy"));

function getMessageText(message: UIMessage<MessageMeta>): string {
  return message.parts
    .flatMap((part) => {
      if (!isTextUIPart(part) || isSystemReminderPart(part)) {
        return [];
      }

      return [part.text];
    })
    .join("\n\n");
}

function clearCopiedTimer(): void {
  if (copiedTimer === null) {
    return;
  }

  window.clearTimeout(copiedTimer);
  copiedTimer = null;
}

function markCopied(): void {
  clearCopiedTimer();
  copied.value = true;
  copiedTimer = window.setTimeout(() => {
    copied.value = false;
    copiedTimer = null;
  }, 1600);
}

async function copyMessageText(): Promise<void> {
  const text = getMessageText(props.message);
  if (!text.trim()) {
    toast.add({ title: "没有可复制的文本", color: "warning" });
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    markCopied();
  } catch (error) {
    toast.add({
      title: "复制失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

onBeforeUnmount(() => {
  clearCopiedTimer();
});
</script>

<template>
  <UTooltip :text="actionLabel">
    <UButton
      size="sm"
      color="neutral"
      variant="ghost"
      data-test="message-copy-action"
      :data-message-id="props.message.id"
      :icon="actionIcon"
      :aria-label="actionLabel"
      @click="copyMessageText"
    />
  </UTooltip>
</template>
