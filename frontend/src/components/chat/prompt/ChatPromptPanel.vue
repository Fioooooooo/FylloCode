<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import { useChatPrompt } from "@renderer/composables/useChatPrompt";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import {
  createChatPromptAttachment,
  revokeChatPromptAttachmentPreview,
  type ChatPromptAttachment,
} from "@renderer/utils/chat-prompt-attachment";
import ChatAgentSelect from "../ChatAgentSelect.vue";
import AttachmentList from "./AttachmentList.vue";
import ContextUsageRing from "./ContextUsageRing.vue";
import PromptActionMenu from "./PromptActionMenu.vue";
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
const attachments = ref<ChatPromptAttachment[]>([]);
let attachmentId = 0;
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

function handleAttachmentSelect(files: File[]): void {
  if (files.length === 0) {
    return;
  }

  attachments.value = [
    ...attachments.value,
    ...files.map((file) => createChatPromptAttachment(file, `attachment-${attachmentId++}`)),
  ];
}

function removeAttachment(id: string): void {
  const index = attachments.value.findIndex((attachment) => attachment.id === id);

  if (index < 0) {
    return;
  }

  const [removedAttachment] = attachments.value.splice(index, 1);

  if (removedAttachment) {
    revokeChatPromptAttachmentPreview(removedAttachment);
  }
}

onBeforeUnmount(() => {
  attachments.value.forEach(revokeChatPromptAttachmentPreview);
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
        <template v-if="attachments.length > 0" #header>
          <AttachmentList :attachments="attachments" @remove="removeAttachment" />
        </template>

        <template #footer>
          <div class="inline-flex items-center gap-1 min-w-0">
            <PromptActionMenu @select-files="handleAttachmentSelect" />
            <SlashCommandMenu
              v-model:open="commandMenuOpen"
              v-model:search-term="commandSearchTerm"
              :commands="availableCommands"
              @button-trigger="handleSlashButtonClick"
              @select="handleCommandSelect"
            />
            <ChatAgentSelect v-if="!isAgentLocked" v-model="agent" />
          </div>

          <div class="inline-flex items-center gap-2 min-w-0">
            <ContextUsageRing
              v-if="activeSession"
              :used="activeSession.tokenUsage.used"
              :size="activeSession.tokenUsage.size"
              :cost="activeSession.tokenUsage.cost"
            />
            <UChatPromptSubmit
              :status="chatStatus"
              color="neutral"
              size="sm"
              @stop="chatStore.cancelStream()"
            />
          </div>
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>
