<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  createdAt?: Date | null;
}>();

const shortTime = computed(() => {
  if (!props.createdAt) {
    return null;
  }

  return props.createdAt.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
});

const fullTime = computed(() => {
  if (!props.createdAt) {
    return null;
  }

  return props.createdAt.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
});

const dateTime = computed(() => props.createdAt?.toISOString());
</script>

<template>
  <UTooltip v-if="shortTime && fullTime" :text="fullTime">
    <time
      data-test="message-created-at"
      :datetime="dateTime"
      class="select-none text-xs text-muted"
    >
      {{ shortTime }}
    </time>
  </UTooltip>
</template>
