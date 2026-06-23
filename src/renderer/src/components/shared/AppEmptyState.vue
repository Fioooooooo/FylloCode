<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string;
    title: string;
    description: string;
    actionLabel?: string;
    actionIcon?: string;
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);

const emit = defineEmits<{
  action: [];
}>();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="compact ? 'py-8' : 'py-16'"
    v-bind="$attrs"
  >
    <div
      class="bg-primary/15 flex items-center justify-center mb-4"
      :class="compact ? 'size-12 rounded-xl' : 'size-16 rounded-2xl'"
    >
      <UIcon :name="icon" class="text-primary/70" :class="compact ? 'size-6' : 'size-8'" />
    </div>

    <h3 class="text-base font-semibold text-highlighted">
      {{ title }}
    </h3>

    <p class="text-sm text-muted mt-1 max-w-xs">
      {{ description }}
    </p>

    <UButton
      v-if="actionLabel"
      class="mt-5"
      color="primary"
      :icon="actionIcon"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </UButton>
  </div>
</template>
