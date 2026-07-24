<script setup lang="ts">
import MarkdownRender, {
  removeCustomComponents,
  setCustomComponents,
  type NodeRendererProps,
} from "markstream-vue";
import { computed, onBeforeUnmount, provide, watch, type Component } from "vue";
import type { FylloTagPostTransformNodes } from "./markstream/fyllo-tag";
import {
  FylloActionNode as FeatureFylloActionNode,
  createFylloActionNodeTransformer,
  createFylloActionOrdinalResolver,
  fylloActionMarkstreamCustomHtmlTags,
  prepareFylloActionMarkdown,
  registerPreparedFylloActions,
  type FylloActionHostContextInput,
} from "@renderer/features/fyllo-action/integration";
import {
  FylloSignalNode as FeatureFylloSignalNode,
  createFylloSignalNodeTransformer,
  fylloSignalMarkstreamCustomHtmlTags,
  prepareFylloSignalMarkdown,
} from "@renderer/features/fyllo-signal/integration";
import {
  createFylloActionRegistrationController,
  fylloActionHostContextKey,
  type FylloActionRegistrationController,
} from "@renderer/features/fyllo-action";

const props = defineProps<{
  id: string;
  content: string;
  isStreaming: boolean;
  isDark: boolean;
  enableActions?: boolean;
  enableSignals?: boolean;
  actionContext?: FylloActionHostContextInput;
}>();

const customHtmlTags = computed(() => {
  const tags: string[] = [];
  if (props.enableActions) {
    tags.push(...fylloActionMarkstreamCustomHtmlTags);
  }
  if (props.enableSignals) {
    tags.push(...fylloSignalMarkstreamCustomHtmlTags);
  }
  return tags.length > 0 ? tags : undefined;
});

const preparedMarkdown = computed(() => {
  let content = props.content;
  const action = props.enableActions ? prepareFylloActionMarkdown(content) : null;
  if (action) {
    content = action.content;
  }

  const signal = props.enableSignals ? prepareFylloSignalMarkdown(content) : null;
  if (signal) {
    content = signal.content;
  }

  return { content, action, signal };
});

const renderContent = computed(() => preparedMarkdown.value.content);
const parseOptions = computed<NodeRendererProps["parseOptions"]>(() => {
  const transformers: FylloTagPostTransformNodes[] = [];
  if (preparedMarkdown.value.action) {
    transformers.push(createFylloActionNodeTransformer(preparedMarkdown.value.action));
  }
  if (preparedMarkdown.value.signal) {
    transformers.push(createFylloSignalNodeTransformer(preparedMarkdown.value.signal));
  }
  if (transformers.length === 0) {
    return undefined;
  }

  return {
    postTransformNodes: (nodes) =>
      transformers.reduce((transformed, transform) => transform(transformed), nodes),
  };
});

let registeredCustomId: string | null = null;
let registrationContextKey: string | null = null;
let registrationController: FylloActionRegistrationController | null = null;
let actionOrdinalResolver = createFylloActionOrdinalResolver({
  sourceLength: 0,
  occurrences: [],
});

function getRegistrationController(
  context: FylloActionHostContextInput
): FylloActionRegistrationController {
  const contextKey = JSON.stringify([
    context.projectId,
    context.sessionId,
    context.messageIndex,
    context.partIndex,
  ]);
  if (registrationController && registrationContextKey === contextKey) {
    return registrationController;
  }

  registrationContextKey = contextKey;
  registrationController = createFylloActionRegistrationController(
    context.registerAction,
    (_sessionId, actionId, state) => context.persistActionState(actionId, state)
  );
  return registrationController;
}

// 通过注入向嵌套 Action node 提供源码 ordinal 与状态端口，避免穿透 Markstream 逐层传参。
provide(fylloActionHostContextKey, {
  get projectId() {
    return props.actionContext?.projectId ?? "";
  },
  get sessionId() {
    return props.actionContext?.sessionId ?? "";
  },
  get messageIndex() {
    return props.actionContext?.messageIndex ?? -1;
  },
  get partIndex() {
    return props.actionContext?.partIndex ?? -1;
  },
  resolveActionOrdinal(node) {
    return actionOrdinalResolver(node);
  },
  getActionState(actionId) {
    return props.actionContext?.actionStates?.[actionId];
  },
  getRegistrationError(actionId) {
    return registrationController?.registrationErrors.value.get(actionId);
  },
  retryRegistration(actionId, type) {
    const context = props.actionContext;
    if (!context) {
      return Promise.resolve();
    }
    return getRegistrationController(context).retry(
      context.projectId,
      context.sessionId,
      actionId,
      type
    );
  },
  persistActionState(actionId, state) {
    return props.actionContext?.persistActionState?.(actionId, state) ?? Promise.resolve();
  },
  transitionAction(input) {
    return props.actionContext?.transitionAction?.(input) ?? Promise.resolve({} as never);
  },
  transitionActions(input) {
    return props.actionContext?.transitionActions?.(input) ?? Promise.resolve([]);
  },
});

function removeRegisteredCustomComponents(): void {
  if (!registeredCustomId) {
    return;
  }

  removeCustomComponents(registeredCustomId);
  registeredCustomId = null;
}

function registerFylloTagComponents(): void {
  if (!props.enableActions && !props.enableSignals) {
    return;
  }

  const components: Record<string, Component> = {};
  if (props.enableActions) {
    components[fylloActionMarkstreamCustomHtmlTags[0]] = FeatureFylloActionNode;
  }
  if (props.enableSignals) {
    components[fylloSignalMarkstreamCustomHtmlTags[0]] = FeatureFylloSignalNode;
  }
  setCustomComponents(props.id, components);
  registeredCustomId = props.id;
}

watch(
  () => [props.id, props.enableActions, props.enableSignals] as const,
  () => {
    removeRegisteredCustomComponents();
    registerFylloTagComponents();
  },
  { immediate: true }
);

watch(
  () => [props.content, props.enableActions] as const,
  () => {
    const analysis = preparedMarkdown.value.action?.analysis ?? {
      sourceLength: 0,
      occurrences: [],
    };
    actionOrdinalResolver = createFylloActionOrdinalResolver(analysis);
  },
  { immediate: true }
);

watch(
  () => [preparedMarkdown.value.action, props.actionContext, props.enableActions] as const,
  ([prepared, context, enabled]) => {
    if (!enabled || !prepared || !context) {
      return;
    }

    void registerPreparedFylloActions(prepared, context, getRegistrationController(context));
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  removeRegisteredCustomComponents();
});
</script>

<template>
  <MarkdownRender
    :custom-id="id"
    :custom-html-tags="customHtmlTags"
    :content="renderContent"
    :parse-options="parseOptions"
    :final="!isStreaming"
    :fade="false"
    :typewriter="isStreaming"
    :smooth-streaming="isStreaming ? 'auto' : false"
    :max-live-nodes="isStreaming ? 0 : undefined"
    :batch-rendering="isStreaming"
    :render-batch-size="16"
    :render-batch-delay="8"
    :render-batch-budget-ms="4"
    :is-dark="props.isDark"
  />
</template>

<style scoped>
.markstream-vue :deep(.paragraph-node) {
  margin-top: 0;
}

.markstream-vue :deep(.paragraph-node:last-child) {
  margin-bottom: 0;
}
</style>
