<script setup lang="ts">
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import MarkStream from "./MarkStream.vue";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import { isUserFilePart, isUserImagePart } from "@renderer/utils/chat-message-parts";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";

defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
  agentId?: string;
}>();

function getFilePartUrl(part: UIMessage["parts"][number]): string {
  const value = (part as { url?: unknown }).url;
  return typeof value === "string" ? value : "";
}

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
              :src="getFilePartUrl(part)"
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
