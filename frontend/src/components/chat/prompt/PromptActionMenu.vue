<script setup lang="ts">
import { computed } from "vue";
import type { AcpPromptCapabilities } from "@shared/types/acp-agent";

declare function useFileUpload(options: {
  accept: string;
  multiple: boolean;
  reset: boolean;
  dropzone: boolean;
  onUpdate: (files: File[]) => void;
}): { open: () => void };

type PromptActionMenuItem = {
  label: string;
  icon: string;
  disabled: boolean;
  tooltip?: string;
  onSelect: () => void;
};

const props = defineProps<{
  promptCapabilities: AcpPromptCapabilities;
}>();

const emit = defineEmits<{
  "select-files": [files: File[]];
}>();

const { open: openImageUpload } = useFileUpload({
  accept: "image/*",
  multiple: true,
  reset: true,
  dropzone: false,
  onUpdate: (files: File[]) => emit("select-files", files),
});

const { open: openFileUpload } = useFileUpload({
  accept: "text/*,application/*,.md,.json,.csv,.yml,.yaml,.zip,.tar,.gz,.log",
  multiple: true,
  reset: true,
  dropzone: false,
  onUpdate: (files: File[]) => emit("select-files", files),
});

const items = computed<PromptActionMenuItem[]>(() => [
  {
    label: "上传图片",
    icon: "i-lucide-image",
    disabled: !props.promptCapabilities.image,
    tooltip: props.promptCapabilities.image ? undefined : "当前 agent 不支持图片输入",
    onSelect: () => {
      if (props.promptCapabilities.image) {
        openImageUpload();
      }
    },
  },
  {
    label: "上传文件",
    icon: "i-lucide-file-text",
    disabled: !props.promptCapabilities.embeddedContext,
    tooltip: props.promptCapabilities.embeddedContext ? undefined : "当前 agent 不支持文件输入",
    onSelect: () => {
      if (props.promptCapabilities.embeddedContext) {
        openFileUpload();
      }
    },
  },
]);
</script>

<template>
  <UDropdownMenu :items="items" size="md" :content="{ align: 'start', side: 'top', sideOffset: 8 }">
    <UButton
      data-test="prompt-action-menu"
      variant="ghost"
      color="neutral"
      size="sm"
      aria-label="打开附加功能菜单"
      icon="i-lucide-plus"
    />
  </UDropdownMenu>
</template>
