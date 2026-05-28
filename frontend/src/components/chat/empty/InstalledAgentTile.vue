<script setup lang="ts">
defineProps<{
  agentId: string;
  name: string;
  icon?: string;
  selected?: boolean;
}>();

const emit = defineEmits<{
  select: [agentId: string];
}>();
</script>

<template>
  <div
    class="w-32 h-32 p-4 group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border bg-default transition-colors"
    :class="
      selected
        ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
        : 'border-default hover:border-primary/40 hover:bg-elevated/40'
    "
    @click="emit('select', agentId)"
  >
    <span
      v-if="selected"
      class="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-inverted"
    >
      <UIcon name="i-lucide-check" class="h-3 w-3" />
    </span>
    <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white">
      <img v-if="icon" :src="icon" :alt="name" class="h-full w-full object-cover" />
      <UIcon v-else name="i-lucide-terminal" class="h-5 w-5 text-muted" />
    </div>
    <span class="line-clamp-1 text-sm font-medium text-highlighted">{{ name }}</span>
  </div>
</template>
