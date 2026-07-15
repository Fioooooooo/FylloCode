<script setup lang="ts">
import MarkdownRender, {
  removeCustomComponents,
  setCustomComponents,
  type NodeRendererProps,
} from "markstream-vue";
import { computed, onBeforeUnmount, provide, watch } from "vue";
import {
  FylloActionNode as FeatureFylloActionNode,
  createFylloActionNodeTransformer,
  createFylloActionOrdinalResolver,
  fylloActionMarkstreamCustomHtmlTags,
  prepareFylloActionMarkdown,
  type FylloActionHostContextInput,
} from "@renderer/features/fyllo-action/integration";
import { fylloActionHostContextKey } from "@renderer/features/fyllo-action";

const props = defineProps<{
  id: string;
  content: string;
  isStreaming: boolean;
  isDark: boolean;
  enableActions?: boolean;
  actionContext?: FylloActionHostContextInput;
}>();

const customHtmlTags = computed(() =>
  props.enableActions ? fylloActionMarkstreamCustomHtmlTags : undefined
);
const preparedMarkdown = computed(() =>
  props.enableActions ? prepareFylloActionMarkdown(props.content) : null
);
const renderContent = computed(() => preparedMarkdown.value?.content ?? props.content);
const parseOptions = computed<NodeRendererProps["parseOptions"]>(() =>
  preparedMarkdown.value
    ? { postTransformNodes: createFylloActionNodeTransformer(preparedMarkdown.value) }
    : undefined
);

let registeredCustomId: string | null = null;
let actionOrdinalResolver = createFylloActionOrdinalResolver(
  prepareFylloActionMarkdown(props.content).analysis
);

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

function registerFylloActionComponents(): void {
  if (!props.enableActions) {
    return;
  }

  setCustomComponents(props.id, {
    [fylloActionMarkstreamCustomHtmlTags[0]]: FeatureFylloActionNode,
  });
  registeredCustomId = props.id;
}

watch(
  () => [props.id, props.enableActions] as const,
  () => {
    removeRegisteredCustomComponents();
    registerFylloActionComponents();
  },
  { immediate: true }
);

watch(
  () => [props.content, props.enableActions] as const,
  () => {
    const analysis =
      preparedMarkdown.value?.analysis ?? prepareFylloActionMarkdown(props.content).analysis;
    actionOrdinalResolver = createFylloActionOrdinalResolver(analysis);
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
