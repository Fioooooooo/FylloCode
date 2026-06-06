<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useChatStore } from "@renderer/stores/chat";

const chatStore = useChatStore();
const { streamError } = storeToRefs(chatStore);
</script>

<template>
  <UAlert
    v-if="streamError"
    color="error"
    variant="soft"
    icon="i-lucide-circle-alert"
    class="mt-3"
    :title="streamError.message"
    :description="`错误代码：${streamError.code}`"
  />
</template>
