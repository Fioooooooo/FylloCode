<script setup lang="ts">
import { computed } from "vue";
import type { UIMessage } from "ai";
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import ChatToolGroup from "./ChatToolGroup.vue";
import SubagentCallCard from "./SubagentCallCard.vue";
import AssistantStreamIndicator from "./AssistantStreamIndicator.vue";
import { getToolIcon, getToolText, getToolSuffix, getToolOutput } from "@renderer/utils/chatTool";
import { useSessionStore } from "@renderer/stores";
import { sessionActionApi } from "@renderer/api/session/action";
import type { FylloActionState } from "@shared/fyllo-action/protocol";
import type {
  RegisterFylloActionInput,
  TransitionFylloActionInput,
  TransitionFylloActionsInput,
} from "@shared/fyllo-action/protocol";
import {
  projectSubagentCalls,
  type ChatToolEntry,
  type SubagentCallProjection,
} from "@renderer/utils/chatSubagent";

type MessagePart = UIMessage["parts"][number];
type RenderItem =
  | { kind: "part"; key: string; part: MessagePart; partIndex: number }
  | { kind: "tool-group"; key: string; tools: ChatToolEntry[] }
  | { kind: "subagent-call"; key: string; call: SubagentCallProjection };

const props = defineProps<{
  message: UIMessage;
  isDark: boolean;
  enableActions?: boolean;
  sessionId?: string | null;
  messageIndex?: number;
  actionStates?: Record<string, FylloActionState>;
  projectId?: string | null;
  streamStartedAt?: number | null;
}>();

const sessionStore = useSessionStore();
const subagentProjection = computed(() => projectSubagentCalls(props.message.parts));

function buildPartKey(part: MessagePart, partIndex: number): string {
  return `${props.message.id}-${part.type}-${partIndex}`;
}

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  let toolRun: ChatToolEntry[] = [];

  function flushToolRun(): void {
    // Group two or more consecutive tool parts into a single `ChatToolGroup`;
    // a lone tool part is rendered individually.
    if (toolRun.length >= 2) {
      const first = toolRun[0];
      const last = toolRun[toolRun.length - 1];
      items.push({
        kind: "tool-group",
        key: `${props.message.id}-tool-group-${first.partIndex}-${last.partIndex}`,
        tools: toolRun,
      });
    } else if (toolRun.length === 1) {
      const [tool] = toolRun;
      items.push({
        kind: "part",
        key: buildPartKey(tool.part, tool.partIndex),
        part: tool.part,
        partIndex: tool.partIndex,
      });
    }

    toolRun = [];
  }

  props.message.parts.forEach((part, partIndex) => {
    if (isToolUIPart(part)) {
      if (subagentProjection.value.hiddenPartIndexes.has(partIndex)) return;

      const subagentCall = subagentProjection.value.rootByPartIndex.get(partIndex);
      if (subagentCall) {
        flushToolRun();
        items.push({
          kind: "subagent-call",
          key: `${props.message.id}-subagent-${subagentCall.root.part.toolCallId}`,
          call: subagentCall,
        });
        return;
      }

      toolRun.push({ part, partIndex });
      return;
    }

    flushToolRun();
    items.push({
      kind: "part",
      key: buildPartKey(part, partIndex),
      part,
      partIndex,
    });
  });

  flushToolRun();
  return items;
});

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
    <ChatToolGroup v-if="item.kind === 'tool-group'" :tools="item.tools" />

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

    <UChatTool
      v-else-if="isToolUIPart(item.part)"
      :icon="getToolIcon(item.part)"
      :streaming="isToolStreaming(item.part)"
      :text="getToolText(item.part)"
      :suffix="getToolSuffix(item.part)"
    >
      <pre v-if="getToolOutput(item.part)" class="whitespace-pre-wrap wrap-anywhere text-xs">{{
        getToolOutput(item.part)
      }}</pre>
    </UChatTool>

    <MarkStream
      v-else-if="isTextUIPart(item.part)"
      :id="item.key"
      :content="item.part.text"
      :is-streaming="isPartStreaming(item.part)"
      :is-dark="props.isDark"
      :enable-actions="Boolean(buildActionContext(item.partIndex))"
      :action-context="buildActionContext(item.partIndex)"
    />
  </template>

  <AssistantStreamIndicator
    v-if="props.streamStartedAt !== undefined && props.streamStartedAt !== null"
    :started-at="props.streamStartedAt"
  />
</template>
