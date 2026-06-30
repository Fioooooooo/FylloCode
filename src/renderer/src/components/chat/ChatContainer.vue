<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import { collectPendingFylloActionRailItems } from "@renderer/utils/fyllo-action-rail";
import { collectChatPromptTimelineItems } from "@renderer/utils/chat-prompt-timeline";
import ChatMessageList from "@renderer/components/chat/message/ChatMessageList.vue";
import ChatMessageSkeleton from "@renderer/components/chat/message/ChatMessageSkeleton.vue";
import ChatEmptyAgentPicker from "./empty/ChatEmptyAgentPicker.vue";
import ChatStreamError from "./ChatStreamError.vue";
import ChatPromptPanel from "./prompt/ChatPromptPanel.vue";
import ChatSessionEventRail from "./event/ChatSessionEventRail.vue";
import ChatPromptTimeline from "./ChatPromptTimeline.vue";
import OriginTaskBanner from "./OriginTaskBanner.vue";

const store = useChatStore();
const { chatStatus, streamError } = storeToRefs(store);
const sessionStore = useSessionStore();
const { activeSession, activeSessionId, isLoadingMessages } = storeToRefs(sessionStore);

const messageScrollContainerRef = ref<HTMLElement | null>(null);
const activePromptTimelineItemId = ref<string | null>(null);
const isDraft = computed(() => activeSessionId.value === null);
const pendingActionRailItems = computed(() =>
  collectPendingFylloActionRailItems(activeSession.value)
);
const promptTimelineItems = computed(() =>
  collectChatPromptTimelineItems(activeSession.value?.messages ?? [])
);
const promptTimelineItemIds = computed(() => promptTimelineItems.value.map((item) => item.id));
const showPromptTimeline = computed(
  () => !isDraft.value && !isLoadingMessages.value && promptTimelineItems.value.length > 1
);
const showEventRail = computed(() => {
  const plan = activeSession?.value?.plan ?? [];
  const proposals = activeSession.value
    ? sessionStore.getSessionProposals(activeSession.value.id)
    : [];
  return plan.length > 0 || proposals.length > 0 || pendingActionRailItems.value.length > 0;
});

let removePromptTimelineScrollListener: (() => void) | null = null;

function escapeSelectorValue(value: string): string {
  return CSS.escape(value);
}

function findUserPromptAnchor(container: HTMLElement, messageId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-chat-user-message-id="${escapeSelectorValue(messageId)}"]`
  );
}

function updateActivePromptTimelineItem(): void {
  const items = promptTimelineItems.value;
  if (items.length === 0) {
    activePromptTimelineItemId.value = null;
    return;
  }

  const container = messageScrollContainerRef.value;
  if (!container) {
    activePromptTimelineItemId.value = items[0]?.id ?? null;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const activationLine = containerRect.top + containerRect.height * 0.35;
  let closestItemId: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const anchor = findUserPromptAnchor(container, item.messageId);
    if (!anchor) {
      continue;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const distance = Math.abs(anchorRect.top - activationLine);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestItemId = item.id;
    }
  }

  activePromptTimelineItemId.value = closestItemId ?? items[0]?.id ?? null;
}

function bindPromptTimelineScrollListener(): void {
  removePromptTimelineScrollListener?.();
  removePromptTimelineScrollListener = null;

  const container = messageScrollContainerRef.value;
  if (!container) {
    return;
  }

  const handleScroll = (): void => {
    updateActivePromptTimelineItem();
  };

  container.addEventListener("scroll", handleScroll, { passive: true });
  removePromptTimelineScrollListener = () => {
    container.removeEventListener("scroll", handleScroll);
  };
}

async function handleLocateFylloAction(actionId: string): Promise<void> {
  await nextTick();

  const container = messageScrollContainerRef.value;
  if (!container) {
    return;
  }

  const target = container.querySelector<HTMLElement>(
    `[data-fyllo-action-id="${CSS.escape(actionId)}"]`
  );
  target?.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function handleLocateUserPrompt(messageId: string): Promise<void> {
  await nextTick();

  const container = messageScrollContainerRef.value;
  if (!container) {
    return;
  }

  const target = findUserPromptAnchor(container, messageId);
  target?.scrollIntoView({ block: "center", behavior: "smooth" });
  activePromptTimelineItemId.value = messageId;
}

watch(
  () => messageScrollContainerRef.value,
  () => {
    bindPromptTimelineScrollListener();
    void nextTick(() => {
      updateActivePromptTimelineItem();
    });
  },
  { flush: "post" }
);

watch(
  [promptTimelineItemIds, activeSessionId, isLoadingMessages],
  () => {
    void nextTick(() => {
      updateActivePromptTimelineItem();
    });
  },
  { flush: "post", immediate: true }
);

onBeforeUnmount(() => {
  removePromptTimelineScrollListener?.();
});
</script>

<template>
  <div class="flex-1 flex min-h-0 min-w-0 relative space-x-2 bg-elevated">
    <div class="flex-1 flex flex-col min-h-0 min-w-0 bg-default rounded-lg relative">
      <div class="p-2 border-b border-default/50 shrink-0 flex items-center">
        <UButton icon="i-lucide-panel-left" size="sm" color="neutral" variant="ghost" />
        <OriginTaskBanner />
      </div>

      <div class="relative flex-1 min-h-0">
        <ChatPromptTimeline
          v-if="showPromptTimeline"
          class="absolute left-2 top-4 z-10"
          :items="promptTimelineItems"
          :active-item-id="activePromptTimelineItemId"
          @locate-prompt="handleLocateUserPrompt"
        />

        <div ref="messageScrollContainerRef" class="h-full overflow-y-auto py-4 px-2 relative">
          <div class="max-w-3xl mx-auto h-full">
            <template v-if="isLoadingMessages">
              <ChatMessageSkeleton />
            </template>
            <template v-else>
              <ChatEmptyAgentPicker v-if="isDraft" />
              <ChatMessageList
                v-else
                :messages="activeSession?.messages ?? []"
                :status="chatStatus"
                type="chat"
              />
            </template>

            <div v-if="streamError && !isLoadingMessages" class="px-2.5">
              <ChatStreamError />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="max-w-3xl mx-auto">
          <ChatPromptPanel />
        </div>
      </div>
    </div>

    <div class="shrink-0 flex">
      <div class="flex-1 flex flex-col rounded-lg bg-default overflow-auto">
        <ChatSessionEventRail
          v-if="!isDraft && showEventRail"
          @locate-action="handleLocateFylloAction"
        />
      </div>
    </div>
  </div>
</template>
