<script setup lang="ts">
import CustomAgentIcon from "@renderer/components/acp/CustomAgentIcon.vue";

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
  <UiSurface
    interactive
    padding="none"
    class="group relative flex aspect-square h-32 w-32 flex-col items-center justify-center gap-2"
    :class="selected ? 'bg-primary/15 ring-1 ring-primary/40' : ''"
    @click="emit('select', agentId)"
  >
    <span
      v-if="selected"
      class="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-inverted"
    >
      <UIcon name="i-lucide-check" class="h-3 w-3" />
    </span>
    <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-elevated">
      <img v-if="icon" :src="icon" :alt="name" class="h-full w-full object-cover" />
      <CustomAgentIcon v-else class="h-full w-full" />
    </div>
    <span class="line-clamp-1 text-sm font-medium text-highlighted">{{ name }}</span>
  </UiSurface>
</template>
