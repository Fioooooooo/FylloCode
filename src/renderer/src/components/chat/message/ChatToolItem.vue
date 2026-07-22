<script setup lang="ts">
import { computed } from "vue";
import { isToolStreaming } from "@nuxt/ui/utils/ai";
import ChatToolDetails from "./ChatToolDetails.vue";
import {
  getToolIcon,
  getToolInput,
  getToolOutput,
  getToolText,
  type ChatToolPart,
} from "@renderer/utils/chatTool";

const props = defineProps<{
  part: ChatToolPart;
}>();

const input = computed(() => getToolInput(props.part));
const output = computed(() => getToolOutput(props.part));
const hasDetails = computed(() => input.value !== null || output.value !== null);
</script>

<template>
  <UChatTool
    v-if="hasDetails"
    data-test="chat-tool-item"
    :icon="getToolIcon(props.part)"
    :streaming="isToolStreaming(props.part)"
    :text="getToolText(props.part)"
  >
    <ChatToolDetails :input="input" :output="output" />
  </UChatTool>
  <UChatTool
    v-else
    data-test="chat-tool-item"
    :icon="getToolIcon(props.part)"
    :streaming="isToolStreaming(props.part)"
    :text="getToolText(props.part)"
  />
</template>
