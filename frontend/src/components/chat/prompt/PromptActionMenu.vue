<script setup lang="ts">
type PromptActionMenuItem = {
  label: string;
  icon: string;
  onSelect: () => void;
};

const emit = defineEmits<{
  "select-files": [files: File[]];
}>();

const { open: openImageUpload } = useFileUpload({
  accept: "image/*",
  multiple: true,
  reset: true,
  dropzone: false,
  onUpdate: (files) => emit("select-files", files),
});

const { open: openFileUpload } = useFileUpload({
  accept: "text/*,application/*,.md,.json,.csv,.yml,.yaml,.zip,.tar,.gz,.log",
  multiple: true,
  reset: true,
  dropzone: false,
  onUpdate: (files) => emit("select-files", files),
});

const items: PromptActionMenuItem[] = [
  {
    label: "上传图片",
    icon: "i-lucide-image",
    onSelect: openImageUpload,
  },
  {
    label: "上传文件",
    icon: "i-lucide-file-text",
    onSelect: openFileUpload,
  },
];
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
