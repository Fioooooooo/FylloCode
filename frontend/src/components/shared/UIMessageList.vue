<script setup lang="ts">
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import MarkStream from "./MarkStream.vue";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";

defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
  agentId?: string;
}>();
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
        </template>
      </template>
    </UChatMessages>
  </div>
</template>
