<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import ChatAgentSelect from "./ChatAgentSelect.vue";
import UIMessageList from "@renderer/components/shared/UIMessageList.vue";

const store = useChatStore();
const sessionStore = useSessionStore();
const { chatStatus } = storeToRefs(store);
const { activeSession, draftAgentId } = storeToRefs(sessionStore);

const agent = computed<string | undefined>({
  get: () => activeSession.value?.agentId ?? draftAgentId.value ?? undefined,
  set: (agentId) => {
    if (!agentId) {
      return;
    }

    if (activeSession.value) {
      void sessionStore.setSessionAgent(agentId).catch((error: unknown) => {
        console.error("Failed to update session agent:", error);
      });
      return;
    }

    sessionStore.setDraftAgent(agentId);
  },
});

const input = ref("");

const messages = computed(() => activeSession.value?.messages ?? []);
const isStreaming = computed(
  () => chatStatus.value === "submitted" || chatStatus.value === "streaming"
);

async function handleSubmit(): Promise<void> {
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  await store.sendMessage(text);
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="flex-1 overflow-y-auto py-4 px-2 relative">
      <div class="max-w-240 mx-auto">
        <UIMessageList :messages="messages" :is-streaming="isStreaming" type="chat" />
      </div>
    </div>

    <div class="p-4">
      <div class="max-w-240 mx-auto">
        <UChatPrompt
          v-model="input"
          variant="subtle"
          class="sticky bottom-0 [view-transition-name:chat-prompt]"
          :ui="{ base: 'px-1.5' }"
          @submit="handleSubmit"
        >
          <template #footer>
            <ChatAgentSelect v-model="agent" />

            <UChatPromptSubmit :status="chatStatus" color="neutral" size="sm" />
          </template>
        </UChatPrompt>
      </div>
    </div>
  </div>
</template>
