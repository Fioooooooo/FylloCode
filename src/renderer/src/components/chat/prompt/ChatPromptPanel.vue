<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { useChatPrompt } from "@renderer/composables/useChatPrompt";
import { chatApi } from "@renderer/api/chat";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";
import {
  createChatPromptAttachment,
  revokeChatPromptAttachmentPreview,
  type ChatPromptAttachment,
} from "@renderer/utils/chat-prompt-attachment";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import AttachmentList from "./AttachmentList.vue";
import ConfigOptionsBar from "./ConfigOptionsBar.vue";
import ContextUsageRing from "./ContextUsageRing.vue";
import PromptActionMenu from "./PromptActionMenu.vue";
import SlashCommandMenu from "./SlashCommandMenu.vue";

const chatStore = useChatStore();
const acpAgentsStore = useAcpAgentsStore();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const toast = useToast();
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
const attachments = ref<ChatPromptAttachment[]>([]);
const savingAttachmentCount = ref(0);
const isSavingAttachments = computed(() => savingAttachmentCount.value > 0);
const promptCapabilities = computed(() => acpAgentsStore.getPromptCapabilities(agent.value));
const sendDisabled = computed(
  () => isSavingAttachments.value || attachments.value.some((attachment) => !attachment.uri)
);
let attachmentId = 0;

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",").at(1) ?? "");
    };
    reader.readAsDataURL(file);
  });
}

async function ensureAttachmentSession(): Promise<{ projectId: string; sessionId: string } | null> {
  const active = activeSession.value;
  const projectId = projectStore.currentProject?.id ?? active?.projectId;
  if (!projectId) {
    toast.add({ title: "请先打开项目", color: "warning" });
    return null;
  }
  if (active) {
    return { projectId, sessionId: active.id };
  }

  const agentId = draftAgentId.value;
  if (!agentId) {
    toast.add({
      title: "暂无可用 Agent",
      description: "请先安装 Agent 后再上传附件",
      color: "error",
    });
    return null;
  }

  const createdSession = await sessionStore.createSession({
    projectId,
    agentId,
    title: "New Session",
  });
  return { projectId, sessionId: createdSession.id };
}

async function persistAttachment(file: File, attachment: ChatPromptAttachment): Promise<void> {
  savingAttachmentCount.value += 1;
  try {
    const target = await ensureAttachmentSession();
    if (!target) {
      throw new Error("Cannot save attachment without a session");
    }

    const base64Data = await readFileAsBase64(file);
    const response = await chatApi.saveAttachment(
      target.projectId,
      target.sessionId,
      file.name,
      attachment.mediaType,
      base64Data
    );
    if (!response.ok) {
      throw new Error(response.error.message);
    }

    attachment.uri = response.data.uri;
    attachment.mediaType = response.data.mimeType;
  } catch (error: unknown) {
    removeAttachment(attachment.id);
    toast.add({
      title: "附件保存失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  } finally {
    savingAttachmentCount.value -= 1;
  }
}

function buildPromptParts(text: string): ChatPromptPart[] {
  const parts: ChatPromptPart[] = [{ type: "text", text }];
  for (const attachment of attachments.value) {
    if (!attachment.uri) {
      continue;
    }

    if (attachment.mediaType.startsWith("image/")) {
      parts.push({
        type: "image",
        mediaType: attachment.mediaType,
        uri: attachment.uri,
        filename: attachment.name,
      });
      continue;
    }

    parts.push({
      type: "resource_link",
      mediaType: attachment.mediaType,
      uri: attachment.uri,
      filename: attachment.name,
    });
  }
  return parts;
}

function checkPromptCapabilities(parts: ChatPromptPart[]): boolean {
  if (parts.some((part) => part.type === "image") && !promptCapabilities.value.image) {
    toast.add({
      title: "当前 agent 不支持图片附件，请移除后再发送",
      color: "warning",
    });
    return false;
  }

  if (
    parts.some((part) => part.type === "resource_link") &&
    !promptCapabilities.value.embeddedContext
  ) {
    toast.add({
      title: "当前 agent 不支持文件附件，请移除后再发送",
      color: "warning",
    });
    return false;
  }

  return true;
}

async function submitPrompt(text: string): Promise<boolean> {
  if (sendDisabled.value) {
    return false;
  }

  const parts = buildPromptParts(text);
  if (!checkPromptCapabilities(parts)) {
    return false;
  }

  await chatStore.sendMessage(parts);
  const sentAttachments = attachments.value;
  attachments.value = [];
  sentAttachments.forEach(revokeChatPromptAttachmentPreview);
  return true;
}

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
  canSubmit: () => attachments.value.length > 0,
  onSubmit: submitPrompt,
});

function handleAttachmentSelect(files: File[]): void {
  if (files.length === 0) {
    return;
  }

  const nextAttachments = files.map((file) =>
    createChatPromptAttachment(file, `attachment-${attachmentId++}`)
  );
  attachments.value = [...attachments.value, ...nextAttachments];
  nextAttachments.forEach((attachment, index) => {
    const file = files[index];
    if (file) {
      void persistAttachment(file, attachment);
    }
  });
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

function handleAudioClick(): void {
  toast.add({ title: "即将开放", color: "info" });
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
              v-if="activeSession"
              :used="activeSession.tokenUsage.used"
              :size="activeSession.tokenUsage.size"
              :cost="activeSession.tokenUsage.cost"
            />
            <UTooltip :text="promptCapabilities.audio ? '语音输入' : '当前 agent 不支持音频输入'">
              <UButton
                variant="ghost"
                color="neutral"
                size="sm"
                icon="i-lucide-audio-lines"
                :disabled="!promptCapabilities.audio"
                aria-label="语音输入"
                @click="handleAudioClick"
              />
            </UTooltip>
            <UChatPromptSubmit
              :status="chatStatus"
              color="neutral"
              size="sm"
              :disabled="sendDisabled"
              @stop="chatStore.cancelStream()"
            />
          </div>
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>
