<script setup lang="ts">
import type { UIMessage } from "ai";
import { useDark } from "@vueuse/core";
import { ref, onMounted, watch } from "vue";
import AssistantMessage from "./AssistantMessage.vue";
import UserMessage from "./UserMessage.vue";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";
import { useSessionStore } from "@renderer/stores/session";

const props = defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
}>();
const sessionStore = useSessionStore();

// 在外层调用一次 useDark，作为响应式 prop 透传给所有 MarkStream 实例，避免 355 个实例
// 各自在 setup 里调用 useDark 导致累积 7+ 秒的响应式订阅开销（火焰图实测占比 30%）。
// 延迟到 onMounted 避免 useDark 在 flushJobs 期间触发全局样式重算。
const isDark = ref(false);
onMounted(() => {
  const dark = useDark();
  // 同步当前值并保持响应式：watch dark 的变化，更新 isDark
  isDark.value = dark.value;
  watch(dark, (val) => {
    isDark.value = val;
  });
});

function getMessageIndex(message: UIMessage<MessageMeta>): number {
  return props.messages.findIndex((item) => item.id === message.id);
}

function getMessageSessionId(message: UIMessage<MessageMeta>): string | null {
  return message.metadata?.sessionId ?? null;
}

function getMessageActionStates(message: UIMessage<MessageMeta>) {
  const sessionId = getMessageSessionId(message);
  if (!sessionId) {
    return undefined;
  }

  return sessionStore.sessions.find((session) => session.id === sessionId)?.actionStates;
}
</script>

<template>
  <div class="min-w-0">
    <UChatMessages
      should-auto-scroll
      should-scroll-to-bottom
      :auto-scroll="false"
      :messages="props.messages"
      :status="props.status"
      :user="{
        side: 'right',
        variant: 'naked',
        ui: { content: 'flex flex-col items-end' },
      }"
      :ui="{ indicator: '*:bg-accented' }"
    >
      <template #content="{ message }">
        <UserMessage v-if="message.role === 'user'" :message="message" />
        <AssistantMessage
          v-else
          :message="message"
          :is-dark="isDark"
          :enable-actions="props.type === 'chat'"
          :session-id="getMessageSessionId(message)"
          :message-index="getMessageIndex(message)"
          :action-states="getMessageActionStates(message)"
        />
      </template>
    </UChatMessages>
  </div>
</template>
