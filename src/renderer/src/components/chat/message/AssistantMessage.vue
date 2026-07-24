<script setup lang="ts">
import { computed } from "vue";
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming } from "@nuxt/ui/utils/ai";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import ChatActivityGroup from "./ChatActivityGroup.vue";
import ChatToolItem from "./ChatToolItem.vue";
import SubagentCallCard from "./SubagentCallCard.vue";
import AssistantStreamIndicator from "./AssistantStreamIndicator.vue";
import { projectAssistantRenderItems } from "@renderer/utils/chatAssistant";
import { useSessionStore } from "@renderer/stores";
import { sessionActionApi } from "@renderer/api/session/action";
import type { FylloActionState } from "@shared/fyllo-action/protocol";
import type {
  RegisterFylloActionInput,
  TransitionFylloActionInput,
  TransitionFylloActionsInput,
} from "@shared/fyllo-action/protocol";
import { projectSubagentCalls } from "@renderer/utils/chatSubagent";

const props = defineProps<{
  message: UIMessage;
  isDark: boolean;
  enableActions?: boolean;
  enableSignals?: boolean;
  sessionId?: string | null;
  messageIndex?: number;
  actionStates?: Record<string, FylloActionState>;
  projectId?: string | null;
  streamStartedAt?: number | null;
}>();

const sessionStore = useSessionStore();
const subagentProjection = computed(() => projectSubagentCalls(props.message.parts));
const renderItems = computed(() =>
  projectAssistantRenderItems(props.message.id, props.message.parts, subagentProjection.value)
);

function buildActionContext(partIndex: number) {
  if (
    !props.enableActions ||
    !props.sessionId ||
    !props.projectId ||
    props.messageIndex === undefined ||
    props.messageIndex < 0
  ) {
    return undefined;
  }

  return {
    projectId: props.projectId,
    sessionId: props.sessionId,
    messageIndex: props.messageIndex,
    partIndex,
    actionStates: props.actionStates,
    registerAction: async (input: RegisterFylloActionInput) => {
      const response = await sessionActionApi.registerAction(input);
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    persistActionState: (actionId: string, state: FylloActionState) =>
      sessionStore.persistSessionActionState(props.sessionId!, actionId, state),
    transitionAction: async (input: TransitionFylloActionInput) => {
      const response = await sessionActionApi.transitionAction(input);
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    transitionActions: async (input: TransitionFylloActionsInput) => {
      const response = await sessionActionApi.transitionActions(input);
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
  };
}
</script>

<template>
  <template v-for="item in renderItems" :key="item.key">
    <ChatActivityGroup v-if="item.kind === 'activity-group'" :activities="item.activities" />

    <SubagentCallCard
      v-else-if="item.kind === 'subagent-call'"
      :message="props.message"
      :call="item.call"
      :is-current-stream="props.streamStartedAt !== undefined && props.streamStartedAt !== null"
      :is-dark="props.isDark"
    />

    <UChatReasoning
      v-else-if="isReasoningUIPart(item.part)"
      :text="item.part.text"
      :streaming="isPartStreaming(item.part)"
      icon="i-lucide-brain"
    >
    </UChatReasoning>

    <ChatToolItem v-else-if="isToolUIPart(item.part)" :part="item.part" />

    <MarkStream
      v-else-if="isTextUIPart(item.part)"
      :id="item.key"
      :content="item.part.text"
      :is-streaming="isPartStreaming(item.part)"
      :is-dark="props.isDark"
      :enable-actions="Boolean(buildActionContext(item.partIndex))"
      :enable-signals="props.enableSignals"
      :action-context="buildActionContext(item.partIndex)"
    />
  </template>

  <AssistantStreamIndicator
    v-if="props.streamStartedAt !== undefined && props.streamStartedAt !== null"
    :started-at="props.streamStartedAt"
  />
</template>
