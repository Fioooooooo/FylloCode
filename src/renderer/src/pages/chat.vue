<script setup lang="ts">
import { onMounted } from "vue";
import ChatContainer from "@renderer/components/chat/ChatContainer.vue";
import ChatSidebar from "@renderer/components/chat/ChatSidebar.vue";
import { useSessionStore, useWorkflowStore } from "@renderer/stores";

const sessionStore = useSessionStore();
const workflowStore = useWorkflowStore();

onMounted(() => {
  sessionStore.beginDraftSession();
  void workflowStore.fetchTemplates();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-elevated space-x-2">
    <div class="w-65 h-full flex flex-col bg-default shrink-0 rounded-lg">
      <ChatSidebar />
    </div>

    <div class="flex-1 flex min-w-0">
      <div class="flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto">
        <ChatContainer />
      </div>
    </div>
  </div>
</template>
