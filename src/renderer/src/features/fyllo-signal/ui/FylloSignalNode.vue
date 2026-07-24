<script setup lang="ts">
import { computed } from "vue";
import { parseFylloSignalNode } from "@shared/fyllo-signal/parser";
import type { FylloSignalMarkdownNode } from "@shared/fyllo-signal/protocol";
import { getRendererSignalComponent } from "./renderer-registry";
import FylloSignalShell from "./FylloSignalShell.vue";

const props = defineProps<{
  node: FylloSignalMarkdownNode;
  isDark?: boolean;
  customId?: string;
  indexKey?: number | string;
}>();

const parseResult = computed(() => parseFylloSignalNode(props.node));
const signalComponent = computed(() =>
  parseResult.value.status === "ready" ? getRendererSignalComponent(parseResult.value.type) : null
);
</script>

<template>
  <FylloSignalShell
    :type="parseResult.type"
    :is-dark="props.isDark"
    :custom-id="props.customId"
    :index-key="props.indexKey"
  >
    <component
      :is="signalComponent"
      v-if="signalComponent && parseResult.status === 'ready'"
      :payload="parseResult.payload"
    />
    <span
      v-else-if="parseResult.status === 'invalid'"
      class="inline-flex flex-col text-xs text-error"
      role="status"
      data-fyllo-signal-invalid
    >
      <span>Signal 无效：{{ parseResult.error.message }}</span>
      <span v-for="detail in parseResult.error.details ?? []" :key="detail" class="text-muted">
        {{ detail }}
      </span>
    </span>
  </FylloSignalShell>
</template>
