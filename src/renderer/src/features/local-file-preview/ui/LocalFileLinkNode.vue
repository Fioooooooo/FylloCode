<script setup lang="ts">
import { computed, inject } from "vue";
import { LinkNode, type LinkNodeProps } from "markstream-vue";
import { parseLocalFileLink } from "../model/local-file-link";
import { localFilePreviewHostKey } from "./local-file-preview-context";

const props = defineProps<LinkNodeProps>();
const host = inject(localFilePreviewHostKey, null);
const target = computed(() => parseLocalFileLink(props.node.href));

function handleClick(event: MouseEvent): void {
  if (!target.value || !host) return;
  event.preventDefault();
  event.stopPropagation();
  void host.open(target.value.requestedPath);
}
</script>

<template>
  <LinkNode v-bind="props" @click.capture="handleClick" />
</template>
