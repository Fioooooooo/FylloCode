<script setup lang="ts">
import type { KnowledgeReviewActionPayload } from "@shared/fyllo-action/protocol";

const props = defineProps<{
  payload: KnowledgeReviewActionPayload;
}>();
</script>

<template>
  <div class="space-y-2">
    <div class="space-y-1">
      <p class="text-xs font-medium text-muted">知识条目</p>
      <p class="break-words text-xs leading-5 text-highlighted">{{ props.payload.name }}</p>
    </div>

    <p v-if="props.payload.summary" class="break-words text-xs leading-5 text-muted">
      {{ props.payload.summary }}
    </p>
  </div>
</template>
