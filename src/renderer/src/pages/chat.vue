<script setup lang="ts">
import { onMounted, ref } from "vue";
import ChatContainer from "@renderer/components/chat/ChatContainer.vue";
import ChatSidebar from "@renderer/components/chat/ChatSidebar.vue";
import { useSessionStore, useWorkflowStore } from "@renderer/stores";

const sessionStore = useSessionStore();
const workflowStore = useWorkflowStore();
const isSidebarCollapsed = ref(false);

onMounted(() => {
  sessionStore.beginDraftSession();
  void workflowStore.fetchTemplates();
});
</script>

<template>
  <UDashboardGroup
    as="div"
    class="relative inset-auto flex flex-1 min-h-0 min-w-0 overflow-hidden bg-elevated space-x-2"
    unit="px"
    :persistent="false"
  >
    <UDashboardSidebar
      id="chat-session-sidebar"
      v-model:collapsed="isSidebarCollapsed"
      collapsible
      class="h-full flex flex-col bg-default shrink-0 rounded-lg overflow-hidden"
      :resizable="false"
      :toggle="false"
      :default-size="260"
      :collapsed-size="0"
      :min-size="260"
      :max-size="260"
      :ui="{
        root: 'h-full min-h-0 min-w-0 flex bg-default border-0 rounded-lg overflow-hidden',
        header: 'hidden',
        body: 'p-0 gap-0 min-h-0 flex-1 flex flex-col',
        footer: 'hidden',
      }"
    >
      <ChatSidebar />
    </UDashboardSidebar>

    <div class="flex-1 flex min-w-0">
      <div class="flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto">
        <ChatContainer
          :sidebar-collapsed="isSidebarCollapsed"
          @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed"
        />
      </div>
    </div>
  </UDashboardGroup>
</template>
