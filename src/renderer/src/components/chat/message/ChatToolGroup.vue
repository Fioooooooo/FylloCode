<script setup lang="ts">
import { computed, ref } from "vue";
import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai";
import { isToolStreaming } from "@nuxt/ui/utils/ai";
import {
  getToolGroupIcon,
  getToolIcon,
  getToolOutput,
  getToolSuffix,
  getToolText,
  summarizeToolGroup,
} from "@renderer/utils/chatTool";

type ToolPart = DynamicToolUIPart | ToolUIPart<UITools>;

const props = defineProps<{
  tools: { part: ToolPart; partIndex: number }[];
}>();

const expanded = ref(false);
const summary = computed(() => summarizeToolGroup(props.tools.map((tool) => tool.part)));
const streaming = computed(() => props.tools.some((tool) => isToolStreaming(tool.part)));
const icon = computed(() =>
  getToolGroupIcon(
    props.tools.map((tool) => tool.part),
    isToolStreaming
  )
);
</script>

<template>
  <UChatTool
    v-model:open="expanded"
    data-test="chat-tool-group"
    :icon="icon"
    :streaming="streaming"
    :text="summary"
  >
    <div
      class="space-y-2 p-2 rounded-md ring ring-default max-h-48 overflow-auto"
      data-test="chat-tool-group-items"
    >
      <UChatTool
        v-for="tool in props.tools"
        :key="`${tool.partIndex}-${tool.part.toolCallId}`"
        :icon="getToolIcon(tool.part)"
        :streaming="isToolStreaming(tool.part)"
        :text="getToolText(tool.part)"
        :suffix="getToolSuffix(tool.part)"
      >
        <pre v-if="getToolOutput(tool.part)" class="whitespace-pre-wrap wrap-anywhere text-xs">{{
          getToolOutput(tool.part)
        }}</pre>
      </UChatTool>
    </div>
  </UChatTool>
</template>
