<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import ChatMessageSkeleton from "@renderer/components/chat/message/ChatMessageSkeleton.vue";
import ChatEmptyAgentPicker from "./empty/ChatEmptyAgentPicker.vue";
import ChatStreamError from "./ChatStreamError.vue";
import ChatPromptPanel from "./prompt/ChatPromptPanel.vue";
import ChatSessionEventRail from "./event/ChatSessionEventRail.vue";
import OriginTaskBanner from "./OriginTaskBanner.vue";

const store = useChatStore();
const { chatStatus, streamError } = storeToRefs(store);
const sessionStore = useSessionStore();
const { activeSession, activeSessionId, isLoadingMessages } = storeToRefs(sessionStore);

const isDraft = computed(() => activeSessionId.value === null);
const showEventRail = computed(() => {
  const plan = activeSession?.value?.plan ?? [];
  const proposals = activeSession.value
    ? sessionStore.getSessionProposals(activeSession.value.id)
    : [];
  return plan.length > 0 || proposals.length > 0;
});
</script>

<template>
  <div class="flex-1 flex min-h-0 min-w-0 relative space-x-2 bg-elevated">
    <div class="flex-1 flex flex-col min-h-0 min-w-0 bg-default rounded-lg relative">
      <div v-if="!isDraft" class="absolute inset-x-0 top-0 z-10 pointer-events-none">
        <OriginTaskBanner />
      </div>

      <div class="flex-1 overflow-y-auto py-4 px-2 relative">
        <div class="max-w-3xl mx-auto h-full">
          <template v-if="isLoadingMessages">
            <ChatMessageSkeleton />
          </template>
          <template v-else>
            <ChatEmptyAgentPicker v-if="isDraft" />
            <ChatMessageList
              v-else
              :messages="activeSession?.messages ?? []"
              :status="chatStatus"
              type="chat"
            />
          </template>

          <div v-if="streamError && !isLoadingMessages" class="px-2.5">
            <ChatStreamError />
          </div>
        </div>
      </div>

      <div>
        <div class="max-w-3xl mx-auto">
          <ChatPromptPanel />
        </div>
      </div>
    </div>

    <div class="shrink-0 flex">
      <div class="flex-1 flex flex-col rounded-lg bg-default overflow-auto">
        <ChatSessionEventRail v-if="!isDraft && showEventRail" />
      </div>
    </div>
  </div>
</template>
