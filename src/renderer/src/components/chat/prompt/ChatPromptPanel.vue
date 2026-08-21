<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  useChatAttachment,
  type ChatAttachmentInputBatch,
} from "@renderer/composables/useChatAttachment";
import { useChatPrompt } from "@renderer/composables/useChatPrompt";
import { SessionModeTabs } from "@renderer/features/chat-session-mode";
import { useAcpAgentsStore, useChatStore, useSessionStore } from "@renderer/stores";
import { isImageAttachmentFile } from "@renderer/utils/chat-prompt-attachment";
import AttachmentList from "./AttachmentList.vue";
import ConfigOptionsBar from "./ConfigOptionsBar.vue";
import ContextUsageRing from "./ContextUsageRing.vue";
import PromptActionMenu from "./PromptActionMenu.vue";
import SlashCommandMenu from "./SlashCommandMenu.vue";

const chatStore = useChatStore();
const acpAgentsStore = useAcpAgentsStore();
const sessionStore = useSessionStore();
const { chatStatus } = storeToRefs(chatStore);
const { activeSession, draftAgentId, draftSessionMode, activeDraftProbe } =
  storeToRefs(sessionStore);

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
const dragDepth = ref(0);
const isFileDragActive = computed(() => dragDepth.value > 0);

const {
  attachments,
  hasPendingAttachments,
  materializeAttachmentParts,
  handleAttachmentInput,
  removeAttachment,
  clearAttachments,
} = useChatAttachment(promptCapabilities);
const promptBusy = computed(
  () =>
    chatStatus.value === "submitted" ||
    chatStatus.value === "streaming" ||
    hasPendingAttachments.value
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
  handlePromptInput,
  handlePromptKeyup,
  handleSlashButtonClick,
  handleCommandSelect,
} = useChatPrompt({
  hasAvailableCommands,
  materializeAttachmentParts,
  submitDisabled: promptBusy,
  afterSubmit: () => clearAttachments(),
});
const submitDisabled = computed(() => promptBusy.value || input.value.trim().length === 0);

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
};

function hasFileTransfer(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (Array.from(dataTransfer.types ?? []).includes("Files")) {
    return true;
  }

  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

function resetDragDepth(): void {
  dragDepth.value = 0;
}

function handlePromptPaste(event: ClipboardEvent): void {
  const imageFiles: File[] = [];
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile();
    if (file && isImageAttachmentFile(file)) {
      imageFiles.push(file);
    }
  }

  if (imageFiles.length > 0) {
    handleAttachmentInput({ files: imageFiles });
  }
}

function createFileDropBatch(dataTransfer: DataTransfer): ChatAttachmentInputBatch {
  const files: File[] = [];
  let directoryCount = 0;

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") {
      continue;
    }

    const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.();
    if (entry?.isDirectory === true) {
      directoryCount += 1;
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }

  return {
    files,
    preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [],
  };
}

function handlePromptDragEnter(event: DragEvent): void {
  if (!hasFileTransfer(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  dragDepth.value += 1;
}

function handlePromptDragOver(event: DragEvent): void {
  if (!hasFileTransfer(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  if (dragDepth.value === 0) {
    dragDepth.value = 1;
  }
}

function handlePromptDragLeave(event: DragEvent): void {
  if (!hasFileTransfer(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}

function handlePromptDrop(event: DragEvent): void {
  if (!hasFileTransfer(event.dataTransfer)) {
    resetDragDepth();
    return;
  }

  event.preventDefault();
  const dataTransfer = event.dataTransfer;
  resetDragDepth();
  if (dataTransfer) {
    handleAttachmentInput(createFileDropBatch(dataTransfer));
  }
}

function handlePromptDragEnd(event: DragEvent): void {
  if (hasFileTransfer(event.dataTransfer)) {
    event.preventDefault();
  }
  resetDragDepth();
}

onBeforeUnmount(resetDragDepth);
</script>

<template>
  <div class="p-4">
    <div class="flex flex-col items-start gap-2">
      <SessionModeTabs
        v-if="!activeSession"
        :model-value="draftSessionMode"
        @update:model-value="sessionStore.setDraftSessionMode"
      />

      <div
        :ref="setPromptShellRef"
        class="w-full transition-colors duration-150"
        :class="isFileDragActive && 'border-primary/40 bg-primary/5'"
        @keydown.capture="handlePromptKeydown"
        @input.capture="handlePromptInput"
        @keyup.capture="handlePromptKeyup"
        @focusout="handlePromptFocusOut"
        @paste.capture="handlePromptPaste"
        @dragenter="handlePromptDragEnter"
        @dragover="handlePromptDragOver"
        @dragleave="handlePromptDragLeave"
        @drop="handlePromptDrop"
        @dragend="handlePromptDragEnd"
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
            <div class="inline-flex min-w-0 items-center gap-0.5">
              <PromptActionMenu
                :prompt-capabilities="promptCapabilities"
                @select-files="({ files }) => handleAttachmentInput({ files })"
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

            <div class="inline-flex min-w-0 items-center gap-2">
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
  </div>
</template>
