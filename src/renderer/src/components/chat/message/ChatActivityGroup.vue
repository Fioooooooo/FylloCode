<script setup lang="ts">
import { computed, ref } from "vue";
import { isReasoningUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import ChatToolItem from "./ChatToolItem.vue";
import {
  getActivityGroupIcon,
  summarizeActivityGroup,
  type AssistantActivityEntry,
} from "@renderer/utils/chatAssistant";

const props = defineProps<{
  activities: AssistantActivityEntry[];
}>();

const expanded = ref(false);

function isActivityStreaming(entry: AssistantActivityEntry): boolean {
  return isReasoningUIPart(entry.part) ? isPartStreaming(entry.part) : isToolStreaming(entry.part);
}

const summary = computed(() => summarizeActivityGroup(props.activities));
const streaming = computed(() => props.activities.some(isActivityStreaming));
const icon = computed(() => getActivityGroupIcon(props.activities, isActivityStreaming));
</script>

<template>
  <UChatTool
    v-model:open="expanded"
    data-test="chat-activity-group"
    :icon="icon"
    :streaming="streaming"
    :text="summary"
  >
    <div
      class="space-y-2 p-2 rounded-md ring ring-default max-h-48 overflow-auto"
      data-test="chat-activity-group-items"
    >
      <template v-for="activity in props.activities" :key="activity.partIndex">
        <UChatReasoning
          v-if="isReasoningUIPart(activity.part)"
          data-test="chat-activity-reasoning"
          :text="activity.part.text"
          :streaming="false"
          :duration="isPartStreaming(activity.part) ? 0 : undefined"
          icon="i-lucide-brain"
        />
        <ChatToolItem v-else :part="activity.part" />
      </template>
    </div>
  </UChatTool>
</template>
