<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="space-y-1">
    <span
      class="text-[11px] font-medium uppercase tracking-wider text-primary-600 dark:text-primary-400"
    >
      {{ eyebrow }}
    </span>
    <h1 class="text-xl font-semibold tracking-tight text-highlighted">{{ title }}</h1>
    <p class="text-sm text-muted">{{ description }}</p>
  </div>
</template>
