<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useChatPrompt } from "@renderer/composables/useChatPrompt";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import ChatAgentSelect from "./ChatAgentSelect.vue";
import ContextUsageRing from "./ContextUsageRing.vue";
import SlashCommandMenu from "./SlashCommandMenu.vue";

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const { chatStatus } = storeToRefs(chatStore);
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

const isAgentLocked = computed(() => (activeSession.value?.messages.length ?? 0) > 0);
const availableCommands = computed(() => activeSession.value?.availableCommands ?? []);
const hasAvailableCommands = computed(() => availableCommands.value.length > 0);
const {
  input,
  setPromptShellRef,
  commandMenuOpen,
  commandSearchTerm,
  temporaryPlaceholder,
  handleSubmit,
  handlePromptFocusOut,
  handlePromptKeydown,
  handleSlashButtonClick,
  handleCommandSelect,
} = useChatPrompt({
  hasAvailableCommands,
  onSubmit: async (text) => chatStore.sendMessage(text),
});
</script>

<template>
  <div class="py-4">
    <div
      :ref="setPromptShellRef"
      @keydown.capture="handlePromptKeydown"
      @focusout="handlePromptFocusOut"
    >
      <UChatPrompt
        v-model="input"
        :placeholder="temporaryPlaceholder"
        variant="subtle"
        :maxrows="15"
        class="sticky bottom-0 [view-transition-name:chat-prompt]"
        :ui="{ base: 'px-1.5' }"
        @submit="handleSubmit"
      >
        <template #footer>
          <div class="inline-flex items-center gap-2 min-w-0">
            <ContextUsageRing
              v-if="activeSession"
              :used="activeSession.tokenUsage.used"
              :size="activeSession.tokenUsage.size"
              :cost="activeSession.tokenUsage.cost"
            />
            <SlashCommandMenu
              v-model:open="commandMenuOpen"
              v-model:search-term="commandSearchTerm"
              :commands="availableCommands"
              @button-trigger="handleSlashButtonClick"
              @select="handleCommandSelect"
            />
            <ChatAgentSelect v-if="!isAgentLocked" v-model="agent" />
          </div>

          <UChatPromptSubmit
            :status="chatStatus"
            color="neutral"
            size="sm"
            @stop="chatStore.cancelStream()"
          />
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>
