<script setup lang="ts">
import type { ShowTimeSignalPayload } from "@shared/fyllo-signal/protocol";

defineProps<{
  payload: ShowTimeSignalPayload;
}>();
</script>

<template>
  <span
    class="my-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-default bg-elevated px-2.5 py-1 text-xs font-medium text-highlighted"
    data-fyllo-signal-show-time
  >
    <UIcon name="i-lucide-clock-3" class="size-3.5 shrink-0 text-muted" />
    <span class="truncate">{{ payload.label }}</span>
  </span>
</template>
