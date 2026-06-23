<script setup lang="ts">
defineProps<{
  variant: "more" | "promo";
  totalCount: number;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <UiSurface
    v-if="variant === 'more'"
    interactive
    padding="none"
    class="flex aspect-square h-32 w-32 flex-col items-center justify-center gap-2 text-center"
    @click="emit('click')"
  >
    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated text-muted">
      <UIcon name="i-lucide-arrow-right-circle" class="h-5 w-5" />
    </div>
    <span class="text-sm font-medium text-highlighted"> More Agents </span>
    <span class="text-xs text-muted">浏览并安装更多</span>
  </UiSurface>

  <div
    v-else
    class="group flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/15 p-4 text-center transition-colors hover:bg-primary/15"
    @click="emit('click')"
  >
    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
      <UIcon name="i-lucide-sparkles" class="h-5 w-5" />
    </div>
    <span class="text-sm font-medium text-primary"> {{ totalCount }}+ Agents Available </span>
    <span class="text-xs text-muted">点击安装你的第一个 Agent</span>
  </div>
</template>
