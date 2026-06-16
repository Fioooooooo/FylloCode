<script setup lang="ts">
import { onMounted } from "vue";
import ChatContainer from "@renderer/components/chat/ChatContainer.vue";
import ChatSidebar from "@renderer/components/chat/ChatSidebar.vue";
import { useSessionStore } from "@renderer/stores/session";

const sessionStore = useSessionStore();

onMounted(() => {
  sessionStore.beginDraftSession();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <aside class="w-65 h-full flex flex-col border-r border-default bg-default shrink-0">
      <ChatSidebar />
    </aside>

    <main class="flex-1 flex flex-col min-w-0 bg-default">
      <ChatContainer />
    </main>
  </div>
</template>
