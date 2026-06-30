<script setup lang="ts">
import type { PlanCreateActionPayload } from "@shared/types/fyllo-action";

const props = defineProps<{
  payload: PlanCreateActionPayload;
}>();
</script>

<template>
  <div class="space-y-2">
    <div class="space-y-1">
      <p class="text-xs font-medium text-muted">规划标识</p>
      <p class="break-words font-mono text-xs text-highlighted">{{ props.payload.slug }}</p>
    </div>

    <div class="space-y-1">
      <p class="text-xs font-medium text-muted">规划目标</p>
      <p class="whitespace-pre-wrap break-words text-xs leading-5 text-muted">
        {{ props.payload.goal }}
      </p>
    </div>
  </div>
</template>
