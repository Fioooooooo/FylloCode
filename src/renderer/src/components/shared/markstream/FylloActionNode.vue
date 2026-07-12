<script setup lang="ts">
import { computed, inject } from "vue";
import { getFylloActionDefinition } from "@renderer/config/fyllo-actions";
import { useFylloActionDispatcher } from "@renderer/composables/useFylloActionDispatcher";
import FylloActionShell from "./FylloActionShell.vue";
import { fylloActionHostContextKey } from "./fyllo-action-context";
import {
  buildChatFylloActionId,
  parseFylloActionNode,
  type FylloActionMarkdownNode,
} from "@renderer/utils/fyllo-action";
import type { FylloActionHandlerResult, FylloActionState } from "@shared/types/fyllo-action";

const props = defineProps<{
  node: FylloActionMarkdownNode;
  isDark?: boolean;
  customId?: string;
  indexKey?: number | string;
}>();
const { dispatchFylloAction } = useFylloActionDispatcher();
const hostContext = inject(fylloActionHostContextKey, null);
const actionOrdinal = hostContext?.resolveActionOrdinal(props.node) ?? null;

const parseResult = computed(() => parseFylloActionNode(props.node));

const definition = computed(() =>
  parseResult.value.status === "ready" ? getFylloActionDefinition(parseResult.value.type) : null
);

const actionComponent = computed(() => definition.value?.component ?? null);

const actionId = computed(() => {
  if (
    parseResult.value.status !== "ready" ||
    !hostContext ||
    actionOrdinal === null ||
    hostContext.sessionId.length === 0 ||
    hostContext.messageIndex < 0 ||
    hostContext.partIndex < 0
  ) {
    return null;
  }

  return buildChatFylloActionId({
    sessionId: hostContext.sessionId,
    messageIndex: hostContext.messageIndex,
    partIndex: hostContext.partIndex,
    actionOrdinalInPart: actionOrdinal,
  });
});

const persistedState = computed(() =>
  actionId.value ? hostContext?.getActionState(actionId.value) : undefined
);

function confirmReadyAction(): Promise<FylloActionHandlerResult> {
  if (parseResult.value.status !== "ready") {
    return Promise.resolve({
      outcome: "failed",
      error: "Fyllo action is not ready.",
    });
  }

  const context: { sessionId?: string | null; actionId?: string | null } = {
    sessionId: hostContext?.sessionId,
  };
  if (actionId.value) {
    context.actionId = actionId.value;
  }

  return dispatchFylloAction(parseResult.value.type, parseResult.value.payload, context);
}

function persistActionState(targetActionId: string, state: FylloActionState): Promise<void> {
  if (!hostContext?.persistActionState) {
    return Promise.resolve();
  }

  return hostContext.persistActionState(targetActionId, state);
}
</script>

<template>
  <FylloActionShell
    :parse-result="parseResult"
    :definition="definition"
    :is-dark="props.isDark"
    :custom-id="props.customId"
    :index-key="props.indexKey"
    :action-id="actionId"
    :persisted-state="persistedState"
    :confirm-handler="confirmReadyAction"
    :persist-action-state="persistActionState"
  >
    <component
      :is="actionComponent"
      v-if="actionComponent && parseResult.status === 'ready'"
      :payload="parseResult.payload"
    />
  </FylloActionShell>
</template>
