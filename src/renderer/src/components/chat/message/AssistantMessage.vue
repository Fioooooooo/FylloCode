<script setup lang="ts">
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import { getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";

const props = defineProps<{
  message: UIMessage;
  isDark: boolean;
}>();
</script>

<template>
  <template
    v-for="(part, index) in props.message.parts"
    :key="`${message.id}-${part.type}-${index}`"
  >
    <UChatReasoning
      v-if="isReasoningUIPart(part)"
      :text="part.text"
      :streaming="isPartStreaming(part)"
      :default-open="true"
    >
      <MarkStream
        :id="`${message.id}-${part.type}-${index}`"
        :content="part.text"
        :is-streaming="isPartStreaming(part)"
        :is-dark="props.isDark"
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

    <MarkStream
      v-else-if="isTextUIPart(part)"
      :id="`${message.id}-${part.type}-${index}`"
      :content="part.text"
      :is-streaming="isPartStreaming(part)"
      :is-dark="props.isDark"
    />
  </template>
</template>
