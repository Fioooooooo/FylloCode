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
  <div
    class="w-32 h-32 p-4 group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors"
    :class="
      variant === 'promo'
        ? 'min-h-36 w-full border-primary/40 bg-primary/5 hover:bg-primary/10'
        : 'aspect-square border-default hover:border-primary/40 hover:bg-elevated/40'
    "
    @click="emit('click')"
  >
    <div
      class="flex h-10 w-10 items-center justify-center rounded-lg"
      :class="variant === 'promo' ? 'bg-primary/15 text-primary' : 'bg-elevated text-muted'"
    >
      <UIcon
        :name="variant === 'promo' ? 'i-lucide-sparkles' : 'i-lucide-arrow-right-circle'"
        class="h-5 w-5"
      />
    </div>
    <span
      class="text-sm font-medium"
      :class="variant === 'promo' ? 'text-primary' : 'text-highlighted'"
    >
      <template v-if="variant === 'promo'">{{ totalCount }}+ Agents Available</template>
      <template v-else>More Agents</template>
    </span>
    <span class="text-xs text-muted">
      <template v-if="variant === 'promo'">点击安装你的第一个 Agent</template>
      <template v-else>浏览并安装更多</template>
    </span>
  </div>
</template>
