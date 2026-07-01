<script setup lang="ts">
import { toRef } from "vue";
import { storeToRefs } from "pinia";
import { useChatEventRail } from "@renderer/composables/useChatEventRail";
import { useSessionStore } from "@renderer/stores";
import EventRailContent from "@renderer/components/chat/event/EventRailContent.vue";

const props = defineProps<{
  scrollContainer: HTMLElement | null;
}>();

const sessionStore = useSessionStore();
const { activeSession, activeSessionId } = storeToRefs(sessionStore);
const {
  agentAgendaEntries,
  sessionProposals,
  pendingActionRailItems,
  showEventRail,
  locateFylloAction,
} = useChatEventRail({
  activeSession,
  activeSessionId,
  getSessionProposals: sessionStore.getSessionProposals,
  messageScrollContainerRef: toRef(props, "scrollContainer"),
});
</script>

<template>
  <EventRailContent
    v-if="showEventRail"
    :agent-agenda-entries="agentAgendaEntries"
    :session-proposals="sessionProposals"
    :pending-action-items="pendingActionRailItems"
    @locate-action="locateFylloAction"
  />
</template>
