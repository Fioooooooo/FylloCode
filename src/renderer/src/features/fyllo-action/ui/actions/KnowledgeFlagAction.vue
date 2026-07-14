<script setup lang="ts">
import type { KnowledgeFlagActionPayload } from "@shared/fyllo-action/protocol";

const props = defineProps<{
  payload: KnowledgeFlagActionPayload;
}>();
</script>

<template>
  <div class="space-y-2">
    <div class="space-y-1">
      <p class="text-xs font-medium text-muted">知识摘要</p>
      <p class="whitespace-pre-wrap break-words text-xs leading-5 text-highlighted">
        {{ props.payload.summary }}
      </p>
    </div>

    <div v-if="props.payload.contextPaths?.length" class="space-y-1">
      <p class="text-xs font-medium text-muted">相关路径</p>
      <ul class="space-y-1">
        <li
          v-for="path in props.payload.contextPaths"
          :key="path"
          class="break-all font-mono text-xs leading-5 text-muted"
        >
          {{ path }}
        </li>
      </ul>
    </div>
  </div>
</template>
