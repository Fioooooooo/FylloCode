<script setup lang="ts">
import { computed } from "vue";
import { useColorMode } from "@vueuse/core";
import { Codemirror } from "vue-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

defineProps<{
  modelValue: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const colorMode = useColorMode();

const extensions = computed(() =>
  colorMode.state.value === "dark" ? [yaml(), oneDark] : [yaml()]
);

function updateValue(value: string): void {
  emit("update:modelValue", value);
}
</script>

<template>
  <div
    class="h-full overflow-hidden rounded-md border border-default bg-default"
    :class="readonly ? 'opacity-75' : ''"
  >
    <Codemirror
      :model-value="modelValue"
      :extensions="extensions"
      :disabled="readonly"
      :indent-with-tab="true"
      :tab-size="2"
      :style="{ height: '100%', fontSize: '12px' }"
      placeholder="# YAML 格式的工作流模板配置"
      @update:model-value="updateValue"
    />
  </div>
</template>
