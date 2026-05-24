<script setup lang="ts">
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import { onUnmounted, reactive, watch } from "vue";
import { chatApi } from "@renderer/api/chat";
import MarkStream from "./MarkStream.vue";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import {
  getFilePartUrl,
  isUserFilePart,
  isUserImagePart,
} from "@renderer/utils/chat-message-parts";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";

const { messages, status } = defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
  agentId?: string;
}>();

const imageSrcByPartKey = reactive<Record<string, string>>({});
const imageRequestUrlByPartKey = reactive<Record<string, string>>({});
let isDisposed = false;

onUnmounted(() => {
  isDisposed = true;
});

function getImagePartKey(messageId: string, index: number): string {
  return `${messageId}-${index}`;
}

function getFilePartMediaType(part: UIMessage["parts"][number]): string {
  const value = (part as { mediaType?: unknown }).mediaType;
  return typeof value === "string" ? value : "";
}

async function resolveImagePartSrc(key: string, url: string, mediaType: string): Promise<void> {
  try {
    const response = await chatApi.readAttachmentDataUrl(url, mediaType);
    if (isDisposed || imageRequestUrlByPartKey[key] !== url || !response.ok) {
      return;
    }

    imageSrcByPartKey[key] = response.data.dataUrl;
  } catch {
    // Image preview failures must not affect the rest of the message list.
  }
}

watch(
  () => messages,
  () => {
    const activeKeys = new Set<string>();

    for (const message of messages) {
      message.parts.forEach((part, index) => {
        if (message.role !== "user" || !isUserImagePart(part)) {
          return;
        }

        const key = getImagePartKey(message.id, index);
        const url = getFilePartUrl(part);
        activeKeys.add(key);

        if (imageRequestUrlByPartKey[key] === url) {
          return;
        }

        imageRequestUrlByPartKey[key] = url;

        if (!url) {
          imageSrcByPartKey[key] = "";
          return;
        }

        if (!url.startsWith("file://")) {
          imageSrcByPartKey[key] = url;
          return;
        }

        imageSrcByPartKey[key] = "";
        void resolveImagePartSrc(key, url, getFilePartMediaType(part));
      });
    }

    for (const key of Object.keys(imageSrcByPartKey)) {
      if (!activeKeys.has(key)) {
        delete imageSrcByPartKey[key];
        delete imageRequestUrlByPartKey[key];
      }
    }
  },
  { deep: true, immediate: true }
);

function getFilePartName(part: UIMessage["parts"][number]): string {
  const value = (part as { filename?: unknown }).filename;
  return typeof value === "string" ? value : "附件";
}

function getFilePartExtension(part: UIMessage["parts"][number]): string {
  const filename = getFilePartName(part);
  const extension = filename.includes(".") ? filename.split(".").at(-1) : "";
  return extension ? extension.toUpperCase() : "FILE";
}
</script>

<template>
  <div class="min-w-0">
    <UChatMessages
      should-auto-scroll
      should-scroll-to-bottom
      :auto-scroll="false"
      :messages="messages"
      :status="status"
      :user="{ side: 'right', variant: 'subtle' }"
      :ui="{ indicator: '*:bg-accented' }"
    >
      <template #content="{ message }">
        <template
          v-for="(part, index) in message.parts"
          :key="`${message.id}-${part.type}-${index}`"
        >
          <UChatReasoning
            v-if="isReasoningUIPart(part)"
            :text="part.text"
            :streaming="isPartStreaming(part)"
          >
            <MarkStream
              :id="`${message.id}-${part.type}-${index}`"
              :content="part.text"
              :is-streaming="isPartStreaming(part)"
            />
          </UChatReasoning>

          <UChatTool
            v-else-if="isToolUIPart(part)"
            :streaming="isToolStreaming(part)"
            :text="getToolText(part)"
            :suffix="getToolSuffix(part)"
          >
            <pre v-if="getToolOutput(part)" class="whitespace-pre-wrap wrap-anywhere text-xs">{{
              getToolOutput(part)
            }}</pre>
          </UChatTool>

          <template v-else-if="isTextUIPart(part)">
            <MarkStream
              v-if="message.role === 'assistant'"
              :id="`${message.id}-${part.type}-${index}`"
              :content="part.text"
              :is-streaming="isPartStreaming(part)"
            />
            <p
              v-else-if="message.role === 'user' && !isSystemReminderPart(part)"
              class="whitespace-pre-wrap wrap-anywhere"
            >
              {{ part.text }}
            </p>
          </template>

          <div
            v-else-if="message.role === 'user' && isUserImagePart(part)"
            data-test="user-message-image-card"
            class="relative h-32 w-32 overflow-hidden rounded-md border border-default bg-elevated/60"
          >
            <img
              :src="imageSrcByPartKey[getImagePartKey(message.id, index)] ?? ''"
              :alt="getFilePartName(part)"
              class="h-full w-full object-cover"
            />
          </div>

          <div
            v-else-if="message.role === 'user' && isUserFilePart(part)"
            data-test="user-message-file-card"
            class="flex min-w-64 max-w-full items-center gap-3 rounded-md border border-default bg-elevated/45 p-2"
          >
            <div
              class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-file" class="h-5 w-5" />
            </div>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ getFilePartName(part) }}
              </p>
              <div class="flex items-center gap-2 text-xs text-muted">
                <span>{{ getFilePartExtension(part) }}</span>
              </div>
            </div>
          </div>
        </template>
      </template>
    </UChatMessages>
  </div>
</template>
