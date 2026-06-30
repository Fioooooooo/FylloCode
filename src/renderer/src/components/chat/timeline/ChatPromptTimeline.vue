<script setup lang="ts">
import { toRef } from "vue";
import { storeToRefs } from "pinia";
import { usePromptTimeline } from "@renderer/composables/usePromptTimeline";
import { useSessionStore } from "@renderer/stores/session";
import ChatPromptTimelineNav from "@renderer/components/chat/timeline/ChatPromptTimelineNav.vue";

const props = defineProps<{
  scrollContainer: HTMLElement | null;
}>();

const sessionStore = useSessionStore();
const { activeSession, activeSessionId, isLoadingMessages } = storeToRefs(sessionStore);
const { promptTimelineItems, activePromptTimelineItemId, showPromptTimeline, locateUserPrompt } =
  usePromptTimeline({
    activeSession,
    activeSessionId,
    isLoadingMessages,
    messageScrollContainerRef: toRef(props, "scrollContainer"),
  });
</script>

<template>
  <ChatPromptTimelineNav
    v-if="showPromptTimeline"
    :items="promptTimelineItems"
    :active-item-id="activePromptTimelineItemId"
    @locate-prompt="locateUserPrompt"
  />
</template>
