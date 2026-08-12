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
  getToolStatusPresentation,
  getToolText,
  type ChatToolPart,
} from "@renderer/utils/chatTool";
import {
  selectToolTurnFileChanges,
  type TurnFileChange,
} from "@renderer/features/turn-file-change-review";

const props = defineProps<{
  part: ChatToolPart;
  turnFileChanges: readonly TurnFileChange[];
}>();

const input = computed(() => getToolInput(props.part));
const output = computed(() => getToolOutput(props.part));
const error = computed(() => getToolError(props.part));
const diffs = computed(() => getToolDiffs(props.part));
const locations = computed(() => getToolLocations(props.part));
const toolFileChanges = computed(() =>
  selectToolTurnFileChanges(diffs.value, props.turnFileChanges)
);
const displayText = computed(() => getToolText(props.part));
const statusPresentation = computed(() => getToolStatusPresentation(props.part));
const toolUi = computed(() =>
  statusPresentation.value.visible
    ? { leadingIcon: statusPresentation.value.leadingIconClass }
    : undefined
);
const hasDetails = computed(
  () =>
    input.value !== null ||
    output.value !== null ||
    error.value !== null ||
    toolFileChanges.value.length > 0 ||
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
    :ui="toolUi"
  >
    <ChatToolDetails
      :input="input"
      :output="output"
      :error="error"
      :diffs="diffs"
      :locations="locations"
      :turn-file-changes="props.turnFileChanges"
    />
  </UChatTool>
  <UChatTool
    v-else
    data-test="chat-tool-item"
    :icon="getToolIcon(props.part)"
    :streaming="isToolStreaming(props.part)"
    :text="displayText"
    :ui="toolUi"
  />
</template>
