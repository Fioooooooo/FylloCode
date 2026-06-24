<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useChatAttachment } from "@renderer/composables/useChatAttachment";
import { useChatPrompt } from "@renderer/composables/useChatPrompt";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import AttachmentList from "./AttachmentList.vue";
import ConfigOptionsBar from "./ConfigOptionsBar.vue";
import ContextUsageRing from "./ContextUsageRing.vue";
import PromptActionMenu from "./PromptActionMenu.vue";
import SlashCommandMenu from "./SlashCommandMenu.vue";

const chatStore = useChatStore();
const acpAgentsStore = useAcpAgentsStore();
const sessionStore = useSessionStore();
const { chatStatus } = storeToRefs(chatStore);
const { activeSession, draftAgentId, activeDraftProbe } = storeToRefs(sessionStore);

const agent = computed<string | undefined>(
  () => activeSession.value?.agentId ?? draftAgentId.value ?? undefined
);
const availableCommands = computed(() => {
  if (activeSession.value) {
    return activeSession.value.availableCommands ?? [];
  }
  return activeDraftProbe.value?.status === "ready" ? activeDraftProbe.value.availableCommands : [];
});
const hasAvailableCommands = computed(() => availableCommands.value.length > 0);
const promptCapabilities = computed(() => acpAgentsStore.getPromptCapabilities(agent.value));

const {
  attachments,
  hasPendingAttachments,
  attachmentParts,
  handleAttachmentSelect,
  removeAttachment,
  clearAttachments,
} = useChatAttachment(promptCapabilities);
const submitDisabled = computed(
  () => chatStatus.value === "streaming" || hasPendingAttachments.value
);

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
  attachmentParts,
  submitDisabled,
  afterSubmit: () => clearAttachments(),
});
</script>

<template>
  <div class="p-4">
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
            <PromptActionMenu
              :prompt-capabilities="promptCapabilities"
              @select-files="handleAttachmentSelect"
            />
            <SlashCommandMenu
              v-model:open="commandMenuOpen"
              v-model:search-term="commandSearchTerm"
              :commands="availableCommands"
              @button-trigger="handleSlashButtonClick"
              @select="handleCommandSelect"
            />
            <ConfigOptionsBar />
          </div>

          <div class="inline-flex items-center gap-2 min-w-0">
            <ContextUsageRing
              v-if="activeSession && activeSession.tokenUsage.used > 0"
              :used="activeSession.tokenUsage.used"
              :size="activeSession.tokenUsage.size"
              :cost="activeSession.tokenUsage.cost"
            />
            <!--            暂时隐藏这个 button -->
            <!--            <UTooltip :text="promptCapabilities.audio ? '语音输入' : '当前 agent 不支持音频输入'">-->
            <!--              <UButton-->
            <!--                variant="ghost"-->
            <!--                color="neutral"-->
            <!--                size="sm"-->
            <!--                icon="i-lucide-audio-lines"-->
            <!--                :disabled="!promptCapabilities.audio"-->
            <!--                aria-label="语音输入"-->
            <!--                @click="handleAudioClick"-->
            <!--              />-->
            <!--            </UTooltip>-->
            <UChatPromptSubmit
              :status="chatStatus"
              color="neutral"
              size="sm"
              :disabled="submitDisabled"
              @stop="chatStore.cancelStream()"
            />
          </div>
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>
