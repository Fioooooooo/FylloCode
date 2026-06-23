<script lang="ts">
export type MarkdownTabValue = "proposal" | "design" | "tasks";

export interface MarkdownTab {
  label: string;
  value: MarkdownTabValue;
  filename: string;
  content: string | null;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useDark } from "@vueuse/core";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";

const props = defineProps<{
  tabs: MarkdownTab[];
  loading: boolean;
  error: string | null;
  modelValue: MarkdownTabValue;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: MarkdownTabValue];
}>();

const isDark = useDark();

const visibleTabs = computed(() =>
  props.tabs
    .filter((tab) => tab.content !== null)
    .map((tab) => ({
      label: tab.label,
      value: tab.value,
    }))
);

const activeContent = computed(() => {
  return props.tabs.find((tab) => tab.value === props.modelValue)?.content ?? "";
});

function handleModelValueUpdate(value: unknown): void {
  emit("update:modelValue", value as MarkdownTabValue);
}
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <div class="shrink-0">
      <div class="max-w-3xl mx-auto px-6">
        <UTabs
          v-if="visibleTabs.length > 0"
          :model-value="modelValue"
          :items="visibleTabs"
          variant="pill"
          value-key="value"
          @update:model-value="handleModelValueUpdate"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-6 py-6">
        <div v-if="loading" class="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          正在加载 markdown
        </div>

        <div v-else-if="error" class="rounded-lg border border-error/30 bg-error/5 px-4 py-4">
          <div class="flex items-start gap-2 text-sm text-error">
            <UIcon name="i-lucide-circle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ error }}</span>
          </div>
        </div>

        <AppEmptyState
          v-else-if="visibleTabs.length === 0"
          icon="i-lucide-file-text"
          title="暂无可展示的 markdown 文件"
          description="当前 proposal 没有可展示的 markdown 文件。"
        />

        <div v-else class="prose prose-sm dark:prose-invert max-w-none">
          <MarkStream
            :id="`proposal-${props.modelValue}`"
            :content="activeContent"
            :is-streaming="false"
            :is-dark="isDark"
          />
        </div>
      </div>
    </div>
  </div>
</template>
