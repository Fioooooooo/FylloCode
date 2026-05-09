<script setup lang="ts">
import { computed } from "vue";
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import ChatComark from "@renderer/components/chat/ChatComark";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";

const props = defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
}>();

const userAvatar = computed(() =>
  props.type === "chat"
    ? {
        side: "right" as const,
        avatar: { icon: "i-lucide-user" as const },
        ui: { container: "flex-row-reverse justify-start" },
      }
    : undefined
);

const assistantAvatar = computed(() =>
  props.type === "chat"
    ? {
        side: "left" as const,
        avatar: { src: "/claude.webp", ui: { root: "bg-transparent" } },
        actions: [{ label: "Copy to clipboard", icon: "i-lucide-copy" }],
      }
    : undefined
);
</script>

<template>
  <div class="min-w-0">
    <UChatMessages
      should-auto-scroll
      should-scroll-to-bottom
      :auto-scroll="false"
      :messages="messages"
      :status="status"
      :user="userAvatar"
      :assistant="assistantAvatar"
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
            <ChatComark :markdown="part.text" :streaming="isPartStreaming(part)" />
          </UChatReasoning>

          <UChatTool
            v-else-if="isToolUIPart(part)"
            :streaming="isToolStreaming(part)"
            :text="getToolText(part)"
            :suffix="getToolSuffix(part)"
          >
            <pre v-if="getToolOutput(part)" class="whitespace-pre-wrap text-xs">{{
              getToolOutput(part)
            }}</pre>
          </UChatTool>

          <template v-else-if="isTextUIPart(part)">
            <ChatComark
              v-if="message.role === 'assistant'"
              :markdown="part.text"
              :streaming="isPartStreaming(part)"
            />
            <p v-else-if="message.role === 'user'" class="whitespace-pre-wrap">
              {{ part.text }}
            </p>
          </template>
        </template>
      </template>
    </UChatMessages>
  </div>
</template>
