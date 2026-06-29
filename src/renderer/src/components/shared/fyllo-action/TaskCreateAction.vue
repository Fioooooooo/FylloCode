<script setup lang="ts">
import { computed } from "vue";
import type { TaskCreateActionPayload } from "@shared/types/fyllo-action";

const props = defineProps<{
  payload: TaskCreateActionPayload;
}>();

const description = computed(() => {
  const text = props.payload.description?.trim();
  return text && text.length > 0 ? text : "无描述";
});
</script>

<template>
  <div class="space-y-2">
    <div class="space-y-1">
      <p class="text-xs font-medium text-muted">任务标题</p>
      <p class="break-words text-sm font-medium text-highlighted">{{ props.payload.title }}</p>
    </div>

    <div class="space-y-1">
      <p class="text-xs font-medium text-muted">任务描述</p>
      <p class="whitespace-pre-wrap break-words text-xs leading-5 text-muted">
        {{ description }}
      </p>
    </div>
  </div>
</template>
