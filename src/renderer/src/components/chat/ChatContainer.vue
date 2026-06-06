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
import ChatPlanPanel from "./plan/ChatPlanPanel.vue";

const store = useChatStore();
const { chatStatus, streamError } = storeToRefs(store);
const { activeSession, activeSessionId, isLoadingMessages } = storeToRefs(useSessionStore());

const isDraft = computed(() => activeSessionId.value === null);
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
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
        <ChatPlanPanel v-if="!isDraft" :entries="activeSession?.plan ?? []" />
        <ChatPromptPanel />
      </div>
    </div>
  </div>
</template>
