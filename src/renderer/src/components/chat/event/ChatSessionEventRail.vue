<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@renderer/stores";
import ChatPlanPanel from "@renderer/components/chat/event/ChatPlanPanel.vue";
import ChatProposalPanel from "@renderer/components/chat/event/ChatProposalPanel.vue";

const sessionStore = useSessionStore();
const { activeSession } = storeToRefs(sessionStore);
const planEntries = computed(() => activeSession?.value?.plan ?? []);
const sessionProposals = computed(() =>
  activeSession.value ? sessionStore.getSessionProposals(activeSession.value.id) : []
);

const collapsed = ref(false);
</script>

<template>
  <div class="flex h-full bg-default" data-test="event-rail">
    <div v-if="!collapsed" class="w-80 flex flex-col">
      <div class="flex items-center gap-2 px-2 py-2 border-b border-default/50">
        <button
          type="button"
          class="p-1 rounded-md text-muted hover:bg-elevated transition-colors"
          aria-label="收起事件栏"
          data-test="collapse-rail"
          @click="collapsed = true"
        >
          <UIcon name="i-lucide-panel-right-close" class="w-4 h-4" />
        </button>
        <span class="text-sm font-medium text-highlighted">会话事件</span>
      </div>

      <div class="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        <ChatPlanPanel v-if="planEntries.length > 0" :entries="planEntries" />
        <ChatProposalPanel v-if="sessionProposals.length > 0" :proposals="sessionProposals" />
      </div>
    </div>

    <button
      v-else
      type="button"
      class="w-8 h-full flex items-center justify-center text-muted hover:bg-muted transition-colors"
      aria-label="展开事件栏"
      data-test="expand-rail"
      @click="collapsed = false"
    >
      <UIcon name="i-lucide-panel-right-open" class="w-4 h-4" />
    </button>
  </div>
</template>
