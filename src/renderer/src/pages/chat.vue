<script setup lang="ts">
import { onMounted } from "vue";
import ChatPageShell from "@renderer/components/chat/ChatPageShell.vue";
import { useSessionStore } from "@renderer/stores";

const sessionStore = useSessionStore();

onMounted(() => {
  sessionStore.beginDraftSession();
});
</script>

<template>
  <ChatPageShell />
</template>
