<script setup lang="ts">
import MarkdownRender from "markstream-vue";

const props = defineProps<{
  id: string;
  content: string;
  isStreaming: boolean;
  isDark: boolean;
}>();
</script>

<template>
  <MarkdownRender
    :custom-id="id"
    :content="content"
    :final="!isStreaming"
    :fade="false"
    :typewriter="isStreaming"
    :smooth-streaming="isStreaming ? 'auto' : false"
    :max-live-nodes="isStreaming ? 0 : undefined"
    :batch-rendering="isStreaming"
    :render-batch-size="16"
    :render-batch-delay="8"
    :render-batch-budget-ms="4"
    :is-dark="props.isDark"
  />
</template>

<style scoped>
.markstream-vue :deep(.paragraph-node) {
  margin-top: 0;
}

.markstream-vue :deep(.paragraph-node:last-child) {
  margin-bottom: 0;
}
</style>
