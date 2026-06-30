<script setup lang="ts">
import { ref } from "vue";
import ChatFylloActionPanel from "@renderer/components/chat/event/ChatFylloActionPanel.vue";
import ChatPlanPanel from "@renderer/components/chat/event/ChatPlanPanel.vue";
import ChatProposalPanel from "@renderer/components/chat/event/ChatProposalPanel.vue";
import type { PendingFylloActionRailItem } from "@renderer/utils/fyllo-action-rail";
import type { PlanEntry } from "@shared/types/chat";
import type { ProposalMeta } from "@shared/types/proposal";

const props = defineProps<{
  planEntries: PlanEntry[];
  sessionProposals: ProposalMeta[];
  pendingActionItems: PendingFylloActionRailItem[];
}>();

const emit = defineEmits<{
  "locate-action": [actionId: string];
}>();

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
        <ChatPlanPanel v-if="props.planEntries.length > 0" :entries="props.planEntries" />
        <ChatProposalPanel
          v-if="props.sessionProposals.length > 0"
          :proposals="props.sessionProposals"
        />
        <ChatFylloActionPanel
          v-if="props.pendingActionItems.length > 0"
          :items="props.pendingActionItems"
          @locate-action="emit('locate-action', $event)"
        />
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
