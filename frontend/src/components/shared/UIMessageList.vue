<script setup lang="ts">
import { computed } from "vue";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import ChatComark from "@renderer/components/chat/ChatComark";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

const props = defineProps<{
  messages: UIMessage<MessageMeta>[];
  isStreaming: boolean;
  type: "chat" | "side";
}>();

const status = computed(() => (props.isStreaming ? "streaming" : "ready"));
</script>

<template>
  <div class="min-w-0">
    <UChatMessages
      should-auto-scroll
      should-scroll-to-bottom
      :auto-scroll="false"
      :messages="messages"
      :status="status"
      :user="{
        side: 'right',
        avatar: {
          icon: 'i-lucide-user',
        },
        ui: {
          container: 'flex-row-reverse justify-start',
        },
      }"
      :assistant="{
        side: 'left',
        avatar: {
          src: '/claude.webp',
          ui: {
            root: 'bg-transparent',
          },
        },
        actions: [
          {
            label: 'Copy to clipboard',
            icon: 'i-lucide-copy',
          },
        ],
      }"
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

    <div v-if="isStreaming" class="mt-2 flex items-center gap-2 text-xs text-muted">
      <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
      <span>正在执行...</span>
    </div>
  </div>
</template>
