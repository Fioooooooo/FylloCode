<script setup lang="ts">
defineProps<{
  input: string | null;
  output: string | null;
}>();
</script>

<template>
  <div class="max-h-72 space-y-3 overflow-auto" data-test="chat-tool-details">
    <div v-if="input !== null" class="space-y-1" data-test="chat-tool-input">
      <p class="text-xs font-medium text-muted">Input</p>
      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-default">{{ input }}</pre>
    </div>
    <div v-if="output !== null" class="space-y-1" data-test="chat-tool-output">
      <p class="text-xs font-medium text-muted">Output</p>
      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-default">{{ output }}</pre>
    </div>
  </div>
</template>
