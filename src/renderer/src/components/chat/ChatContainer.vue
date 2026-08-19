<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { SessionModeBadge } from "@renderer/features/chat-session-mode";
import { ChatPromptTimeline } from "@renderer/features/chat-prompt-timeline";
import { useChatStore, useSessionStore } from "@renderer/stores";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import ChatMessageSkeleton from "@renderer/components/chat/message/ChatMessageSkeleton.vue";
import ChatEmptyAgentPicker from "./empty/ChatEmptyAgentPicker.vue";
import ChatStreamError from "./ChatStreamError.vue";
import ChatPromptPanel from "./prompt/ChatPromptPanel.vue";
import ChatBackgroundActivityBar from "./ChatBackgroundActivityBar.vue";
import ChatSessionEventRail from "./event/ChatSessionEventRail.vue";
import OriginTaskBanner from "./OriginTaskBanner.vue";
import SessionScopePopover from "./SessionScopePopover.vue";
import ChatSessionActionsMenu from "./ChatSessionActionsMenu.vue";

const store = useChatStore();
const { chatStatus, streamError, activeStreamIndicator } = storeToRefs(store);
const sessionStore = useSessionStore();
const { activeSession, activeSessionId, isLoadingMessages } = storeToRefs(sessionStore);

const props = defineProps<{
  sidebarCollapsed: boolean;
}>();

const emit = defineEmits<{
  "toggle-sidebar": [];
}>();

const messageScrollContainerRef = ref<HTMLElement | null>(null);
const messageContentRef = ref<HTMLElement | null>(null);
const isDraft = computed(() => activeSessionId.value === null);
const sidebarToggleLabel = computed(() =>
  props.sidebarCollapsed ? "展开聊天列表" : "折叠聊天列表"
);
const sidebarToggleIcon = computed(() =>
  props.sidebarCollapsed ? "i-lucide-panel-left-open" : "i-lucide-panel-left-close"
);

function handleCreateSession(): void {
  sessionStore.beginDraftSession();
  store.resetChatState();
}
</script>

<template>
  <div class="flex-1 flex min-h-0 min-w-0 relative space-x-2 bg-elevated">
    <div class="flex-1 flex flex-col min-h-0 min-w-0 bg-default rounded-lg relative">
      <header class="p-2 pb-0 shrink-0 flex items-center">
        <div class="flex w-1/5 shrink-0 items-center gap-1" data-test="chat-header-left-actions">
          <UButton
            :icon="sidebarToggleIcon"
            size="sm"
            color="neutral"
            variant="ghost"
            :title="sidebarToggleLabel"
            :aria-label="sidebarToggleLabel"
            :aria-expanded="String(!sidebarCollapsed)"
            @click="emit('toggle-sidebar')"
          />
          <UButton
            v-if="sidebarCollapsed"
            icon="i-lucide-plus"
            size="sm"
            color="neutral"
            variant="ghost"
            title="新建会话"
            aria-label="新建会话"
            @click="handleCreateSession"
          />
          <SessionModeBadge
            v-if="!isDraft && activeSession"
            :session-mode="activeSession.sessionMode"
          />
        </div>

        <div class="flex w-3/5 shrink-0 items-center justify-center min-w-0">
          <OriginTaskBanner />
        </div>

        <div
          class="flex w-1/5 shrink-0 items-center justify-end gap-1"
          data-test="chat-header-right-actions"
        >
          <SessionScopePopover v-if="!isDraft" />
          <ChatSessionActionsMenu v-if="activeSession" :session-id="activeSession.id" />
        </div>
      </header>

      <section class="relative flex-1 min-h-0 isolate">
        <ChatPromptTimeline
          class="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-fit max-h-[calc(100%-2rem)]"
          :message-content="messageContentRef"
          :scroll-container="messageScrollContainerRef"
        />

        <div
          ref="messageScrollContainerRef"
          class="h-full overflow-y-auto py-4 px-2 relative"
          data-test="chat-message-scroll-container"
          style="mask-image: linear-gradient(to bottom, transparent, black 24px, black 100%)"
        >
          <div ref="messageContentRef" class="max-w-3xl mx-auto h-full">
            <template v-if="isLoadingMessages">
              <ChatMessageSkeleton />
            </template>
            <template v-else>
              <ChatEmptyAgentPicker v-if="isDraft" />
              <ChatMessageList
                v-else
                :messages="activeSession?.messages ?? []"
                :status="chatStatus"
                :stream-indicator="activeStreamIndicator"
                type="chat"
              />
            </template>

            <div v-if="streamError && !isLoadingMessages" class="px-2.5">
              <ChatStreamError />
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div class="max-w-3xl mx-auto border-t border-default/50">
          <ChatBackgroundActivityBar />
          <ChatPromptPanel :class="activeSession ? 'pt-0' : 'pt-2'" />
        </div>
      </footer>
    </div>

    <ChatSessionEventRail :scroll-container="messageScrollContainerRef" />
  </div>
</template>
