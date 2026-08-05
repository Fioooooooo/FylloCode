<script setup lang="ts">
import { computed, toRef } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@renderer/stores";
import { usePromptTimeline } from "../application/use-prompt-timeline";
import ChatPromptTimelineNav from "../ui/ChatPromptTimelineNav.vue";
import { projectChatPromptTimelineItems } from "./chat-message-projection";

const props = defineProps<{
  messageContent: HTMLElement | null;
  scrollContainer: HTMLElement | null;
}>();

const sessionStore = useSessionStore();
const { activeSession, activeSessionId, isLoadingMessages } = storeToRefs(sessionStore);
const projectedPromptTimelineItems = computed(() =>
  projectChatPromptTimelineItems(activeSession.value?.messages ?? [])
);
const { promptTimelineItems, activePromptTimelineItemId, showPromptTimeline, locateUserPrompt } =
  usePromptTimeline({
    promptTimelineItems: projectedPromptTimelineItems,
    activeSessionId,
    isLoadingMessages,
    messageContentRef: toRef(props, "messageContent"),
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
