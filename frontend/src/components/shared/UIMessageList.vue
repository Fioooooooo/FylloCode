<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import MarkStream from "./MarkStream.vue";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";

const props = defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
  agentId?: string;
}>();

const acpAgentsStore = useAcpAgentsStore();
const { icons } = storeToRefs(acpAgentsStore);

const userAvatar = computed(() =>
  props.type === "chat"
    ? {
        side: "right" as const,
        avatar: {
          src: `${import.meta.env.BASE_URL}icon.svg`,
          ui: {
            root: "bg-teal-50 ring-1 ring-teal-500/20 rounded-full p-1.5 bg-default",
            image: "rounded-none mt-1",
          },
        },
        ui: { container: "flex-row-reverse justify-start", leadingAvatarSize: "md" },
      }
    : undefined
);

const assistantAvatar = computed(() => {
  if (props.type !== "chat") return undefined;

  const iconSrc = props.agentId ? icons.value[props.agentId] : undefined;
  return {
    side: "left" as const,
    avatar: iconSrc ? { src: iconSrc, ui: { root: "bg-transparent" } } : undefined,
    ui: { leadingAvatarSize: "sm" },
    actions: [{ label: "Copy to clipboard", icon: "i-lucide-copy" }],
  };
});
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
            <pre v-if="getToolOutput(part)" class="whitespace-pre-wrap text-xs">{{
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
              class="whitespace-pre-wrap"
            >
              {{ part.text }}
            </p>
          </template>
        </template>
      </template>
    </UChatMessages>
  </div>
</template>
