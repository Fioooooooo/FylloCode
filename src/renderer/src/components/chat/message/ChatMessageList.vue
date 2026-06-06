<script setup lang="ts">
import type { UIMessage } from "ai";
import { useDark } from "@vueuse/core";
import { ref, onMounted, watch } from "vue";
import AssistantMessage from "./AssistantMessage.vue";
import UserMessage from "./UserMessage.vue";
import type { ChatStatus, MessageMeta } from "@shared/types/chat";

const { messages, status } = defineProps<{
  messages: UIMessage<MessageMeta>[];
  status: ChatStatus;
  type: "chat" | "side";
}>();

/*
 * 切换到历史消息很多的 session 时（coding agent 单 turn 常有几十次工具调用 + 大段
 * markdown/reasoning），整段消息树一次性同步挂载会让浏览器的 Recalculate Style 占满主
 * 线程，表现为"点击后卡住、等全部渲染完才出现"。
 *
 * content-visibility:auto 让浏览器跳过视口外消息行的渲染与样式计算，只渲染可视区附近的
 * 内容；contain-intrinsic-size 为被跳过的行提供占位高度估算（auto 关键字会记住该行曾经
 * 渲染出的真实高度），避免滚动条长度与位置抖动。
 *
 * 通过 UChatMessages 的 user/assistant props 透传 ui.root，把这两个属性挂到每条
 * UChatMessage 的根 <article>（即 article[data-role]）上，走组件官方扩展点，无需 :deep()
 * 穿透或 DOM 属性选择器。
 */
const rowVisibilityClass = "[content-visibility:auto] [contain-intrinsic-size:auto_200px]";

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
        variant: 'naked',
        ui: { root: rowVisibilityClass, content: 'flex flex-col items-end' },
      }"
      :assistant="{ ui: { root: rowVisibilityClass } }"
      :ui="{ indicator: '*:bg-accented' }"
    >
      <template #content="{ message }">
        <UserMessage v-if="message.role === 'user'" :message="message" />
        <AssistantMessage v-else :message="message" :is-dark="isDark" />
      </template>
    </UChatMessages>
  </div>
</template>
