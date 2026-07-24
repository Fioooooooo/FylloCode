<script setup lang="ts">
const props = defineProps<{
  type?: string;
  isDark?: boolean;
  customId?: string;
  indexKey?: number | string;
}>();
</script>

<template>
  <span
    :data-fyllo-signal-type="props.type"
    :data-custom-id="props.customId"
    :data-index-key="props.indexKey"
    :data-theme="props.isDark ? 'dark' : 'light'"
  >
    <slot />
  </span>
</template>
