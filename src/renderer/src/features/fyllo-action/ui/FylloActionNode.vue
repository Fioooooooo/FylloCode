<script setup lang="ts">
import { computed, inject, watch } from "vue";
import { parseFylloActionNode } from "@shared/fyllo-action/parser";
import { buildChatFylloActionId } from "@shared/fyllo-action/identity";
import type { FylloActionMarkdownNode } from "@shared/fyllo-action/protocol";
import { useFylloActionDispatcher } from "../application/use-fyllo-action-dispatcher";
import { createFylloActionExecutionRuntime } from "../application/execution-runtime";
import { createFylloActionExecutionController } from "../application/execution-controller";
import {
  getRendererActionDefinition,
  rendererActionDefinitions,
  type RendererActionDefinition,
} from "./renderer-registry";
import { fylloActionHostContextKey } from "./fyllo-action-context";
import FylloActionShell from "./FylloActionShell.vue";
import type { FylloActionHostContext } from "./fyllo-action-context";

const props = defineProps<{
  node: FylloActionMarkdownNode;
  isDark?: boolean;
  customId?: string;
  indexKey?: number | string;
}>();

const hostContext = inject<FylloActionHostContext>(fylloActionHostContextKey);
const { dispatchFylloAction } = useFylloActionDispatcher();

const actionOrdinal = computed<number | null>(() => {
  const ordinal = hostContext?.resolveActionOrdinal(props.node);
  return typeof ordinal === "number" && ordinal >= 0 ? ordinal : null;
});

const parseResult = computed(() => parseFylloActionNode(props.node));

const definition = computed<RendererActionDefinition | null>(() => {
  if (parseResult.value.status !== "ready") {
    return null;
  }
  try {
    return getRendererActionDefinition(rendererActionDefinitions, parseResult.value.type);
  } catch {
    return null;
  }
});

const actionComponent = computed(() => definition.value?.component ?? null);

const actionId = computed(() => {
  if (
    parseResult.value.status !== "ready" ||
    !hostContext ||
    actionOrdinal.value === null ||
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
    actionOrdinalInPart: actionOrdinal.value,
  });
});

const persistedState = computed(() =>
  actionId.value ? hostContext?.getActionState(actionId.value) : undefined
);
const registrationError = computed(() =>
  actionId.value ? hostContext?.getRegistrationError(actionId.value) : undefined
);

const runtime = createFylloActionExecutionRuntime();

watch(
  [() => props.node, () => persistedState.value],
  () => {
    runtime.reset();
  },
  { immediate: true }
);

const controller = computed(() => {
  if (
    !hostContext ||
    !actionId.value ||
    parseResult.value.status !== "ready" ||
    !definition.value
  ) {
    return null;
  }

  const type = parseResult.value.type;

  // Capture context values at controller creation time so the handler and state sync
  // always target the same project/session/action, even if the host context changes.
  const frozenProjectId = hostContext.projectId;
  const frozenSessionId = hostContext.sessionId;
  const frozenActionId = actionId.value;

  return createFylloActionExecutionController({
    projectId: frozenProjectId,
    sessionId: frozenSessionId,
    actionId: frozenActionId,
    type,
    handler: (payload) =>
      dispatchFylloAction(type, payload as never, {
        projectId: frozenProjectId,
        sessionId: frozenSessionId,
        actionId: frozenActionId,
      }),
    runtime,
    transitionAction: hostContext.transitionAction,
    transitionActions: hostContext.transitionActions,
    persistActionState: hostContext.persistActionState,
    getActionState: hostContext.getActionState,
  });
});

async function handleConfirm(): Promise<void> {
  if (!controller.value || parseResult.value.status !== "ready") {
    return;
  }

  await controller.value.execute(parseResult.value.payload);
}

async function handleCancel(): Promise<void> {
  await controller.value?.cancel();
}

async function handleRetrySync(): Promise<void> {
  await controller.value?.retrySync();
}

async function handleRetryRegistration(): Promise<void> {
  if (!hostContext || !actionId.value || parseResult.value.status !== "ready") {
    return;
  }
  await hostContext.retryRegistration(actionId.value, parseResult.value.type);
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
    :registration-error="registrationError"
    :execution-status="runtime.status.value"
    :execution-error="runtime.executionError.value"
    :state-sync-error="runtime.stateSyncError.value"
    :is-running="runtime.isRunning.value"
    @confirm="void handleConfirm()"
    @cancel="void handleCancel()"
    @retry-sync="void handleRetrySync()"
    @retry-registration="void handleRetryRegistration()"
  >
    <component
      :is="actionComponent"
      v-if="actionComponent && parseResult.status === 'ready'"
      :payload="parseResult.payload"
    />
  </FylloActionShell>
</template>
