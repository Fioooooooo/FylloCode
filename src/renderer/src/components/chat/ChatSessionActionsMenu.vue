<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { useToast } from "@nuxt/ui/composables";

const props = defineProps<{
  sessionId: string;
}>();

const toast = useToast();

async function copySessionId(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.sessionId);
    toast.add({ title: "会话 ID 已复制", color: "success" });
  } catch (error) {
    toast.add({
      title: "会话 ID 复制失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

const menuItems: DropdownMenuItem[] = [
  {
    label: "复制会话 ID",
    icon: "i-lucide-copy",
    onSelect: (): void => {
      void copySessionId();
    },
  },
];
</script>

<template>
  <UDropdownMenu :items="menuItems">
    <UButton
      icon="i-lucide-more-vertical"
      size="sm"
      color="neutral"
      variant="ghost"
      title="会话操作"
      aria-label="会话操作"
      data-test="chat-session-actions-trigger"
    />
  </UDropdownMenu>
</template>
