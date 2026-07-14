<script setup lang="ts">
import MarkdownRender, { removeCustomComponents, setCustomComponents } from "markstream-vue";
import { computed, onBeforeUnmount, provide, watch } from "vue";
import {
  FylloActionNode as FeatureFylloActionNode,
  createFylloActionOrdinalResolver,
  fylloActionHostContextKey,
  type FylloActionHostContextInput,
} from "@renderer/features/fyllo-action";

const fylloActionCustomHtmlTags = ["fyllo-action"] as const;

const props = defineProps<{
  id: string;
  content: string;
  isStreaming: boolean;
  isDark: boolean;
  enableActions?: boolean;
  actionContext?: FylloActionHostContextInput;
}>();

const customHtmlTags = computed(() =>
  props.enableActions ? fylloActionCustomHtmlTags : undefined
);

let registeredCustomId: string | null = null;
let actionOrdinalResolver = createFylloActionOrdinalResolver(props.content);

// Provide host context to nested FylloActionNode components so they can resolve their
// ordinal position and read/persist action state without prop drilling through markstream-vue.
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
    "fyllo-action": FeatureFylloActionNode,
  });
  registeredCustomId = props.id;
}

watch(
  () => [props.id, props.enableActions] as const,
  () => {
    // A new message id or action enablement change means the rendered content identity changed.
    // Rebuild the ordinal resolver and re-register the custom component with markstream-vue.
    actionOrdinalResolver = createFylloActionOrdinalResolver(props.content);
    removeRegisteredCustomComponents();
    registerFylloActionComponents();
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
    :content="content"
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
