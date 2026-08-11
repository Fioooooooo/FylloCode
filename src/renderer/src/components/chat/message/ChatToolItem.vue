<script setup lang="ts">
import { computed } from "vue";
import { isToolStreaming } from "@nuxt/ui/utils/ai";
import ChatToolDetails from "./ChatToolDetails.vue";
import {
  getToolIcon,
  getToolDiffs,
  getToolError,
  getToolInput,
  getToolLocations,
  getToolOutput,
  getToolStatusText,
  getToolText,
  type ChatToolPart,
} from "@renderer/utils/chatTool";

const props = defineProps<{
  part: ChatToolPart;
}>();

const input = computed(() => getToolInput(props.part));
const output = computed(() => getToolOutput(props.part));
const error = computed(() => getToolError(props.part));
const diffs = computed(() => getToolDiffs(props.part));
const locations = computed(() => getToolLocations(props.part));
const displayText = computed(() => `${getToolText(props.part)} · ${getToolStatusText(props.part)}`);
const hasDetails = computed(
  () =>
    input.value !== null ||
    output.value !== null ||
    error.value !== null ||
    diffs.value.length > 0 ||
    locations.value.length > 0
);
</script>

<template>
  <UChatTool
    v-if="hasDetails"
    data-test="chat-tool-item"
    :icon="getToolIcon(props.part)"
    :streaming="isToolStreaming(props.part)"
    :text="displayText"
  >
    <ChatToolDetails
      :input="input"
      :output="output"
      :error="error"
      :diffs="diffs"
      :locations="locations"
    />
  </UChatTool>
  <UChatTool
    v-else
    data-test="chat-tool-item"
    :icon="getToolIcon(props.part)"
    :streaming="isToolStreaming(props.part)"
    :text="displayText"
  />
</template>
