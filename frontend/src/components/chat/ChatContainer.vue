<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import UIMessageList from "@renderer/components/shared/UIMessageList.vue";
import ChatStreamError from "./ChatStreamError.vue";
import ChatPromptPanel from "./ChatPromptPanel.vue";

const store = useChatStore();
const { chatStatus, streamError } = storeToRefs(store);
const { activeSession } = storeToRefs(useSessionStore());
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="flex-1 overflow-y-auto py-4 px-2 relative">
      <div class="max-w-3xl mx-auto">
        <UIMessageList
          :messages="activeSession?.messages ?? []"
          :status="chatStatus"
          type="chat"
          :agent-id="activeSession?.agentId"
        />

        <div v-if="streamError" class="px-2.5">
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
</template>
