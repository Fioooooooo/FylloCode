<script setup lang="ts">
import { computed } from "vue";
import type { ChatSessionMode } from "@shared/types/chat";
import { getSessionModePresentation } from "../model/session-mode-presentation";

const props = defineProps<{
  sessionMode: ChatSessionMode;
}>();

const presentation = computed(() => getSessionModePresentation(props.sessionMode));
</script>

<template>
  <UTooltip :text="presentation.tooltip" :delay-duration="200">
    <UBadge
      color="neutral"
      variant="soft"
      size="sm"
      tabindex="0"
      :aria-label="`${presentation.label}：${presentation.tooltip}`"
      class="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      data-test="session-mode-badge"
    >
      {{ presentation.label }}
    </UBadge>
  </UTooltip>
</template>
