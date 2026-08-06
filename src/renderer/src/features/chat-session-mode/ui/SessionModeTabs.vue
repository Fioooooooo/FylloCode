<script setup lang="ts">
import { useId } from "vue";
import type { ChatSessionMode } from "@shared/types/chat";
import { CHAT_SESSION_MODES } from "@shared/types/chat";
import { getSessionModePresentation } from "../model/session-mode-presentation";

const labelId = useId();

const props = defineProps<{
  modelValue: ChatSessionMode;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ChatSessionMode];
  change: [value: ChatSessionMode];
}>();

function selectMode(mode: ChatSessionMode): void {
  if (mode === props.modelValue) {
    return;
  }
  emit("update:modelValue", mode);
  emit("change", mode);
}

function handleKeydown(event: KeyboardEvent, mode: ChatSessionMode): void {
  const currentIndex = CHAT_SESSION_MODES.indexOf(mode);
  let nextIndex: number | null = null;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % CHAT_SESSION_MODES.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + CHAT_SESSION_MODES.length) % CHAT_SESSION_MODES.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = CHAT_SESSION_MODES.length - 1;
  }

  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  selectMode(CHAT_SESSION_MODES[nextIndex]);
}
</script>

<template>
  <div class="inline-flex w-fit items-center gap-2" data-test="session-mode-control">
    <span
      :id="labelId"
      class="whitespace-nowrap text-xs font-medium text-muted"
      v-text="'会话模式'"
    />

    <div
      class="inline-flex w-fit items-center rounded-lg border border-default p-0.5"
      role="tablist"
      :aria-labelledby="labelId"
      data-test="session-mode-tabs"
    >
      <UTooltip
        v-for="mode in CHAT_SESSION_MODES"
        :key="mode"
        :text="getSessionModePresentation(mode).tooltip"
        :delay-duration="200"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="modelValue === mode"
          :aria-label="getSessionModePresentation(mode).label"
          :class="[
            'rounded-md px-2 py-1 text-xs font-medium leading-5 outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            modelValue === mode
              ? 'bg-elevated text-highlighted'
              : 'text-muted hover:bg-elevated/60 hover:text-highlighted',
          ]"
          @click="selectMode(mode)"
          @keydown="handleKeydown($event, mode)"
        >
          {{ getSessionModePresentation(mode).label }}
        </button>
      </UTooltip>
    </div>
  </div>
</template>
