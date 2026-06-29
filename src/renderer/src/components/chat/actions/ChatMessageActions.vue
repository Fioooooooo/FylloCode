<script setup lang="ts">
import type { UIMessage } from "ai";
import CopyAction from "./CopyAction.vue";
import MessageTime from "./MessageTime.vue";
import type { MessageMeta } from "@shared/types/chat";

const props = defineProps<{
  message: UIMessage<MessageMeta>;
}>();
</script>

<template>
  <div class="flex items-center gap-1.5">
    <CopyAction :message="props.message" />
    <MessageTime :created-at="props.message.metadata?.createdAt" />
  </div>
</template>
