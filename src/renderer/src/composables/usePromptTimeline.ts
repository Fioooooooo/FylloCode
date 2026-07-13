import { computed, nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  collectChatPromptTimelineItems,
  type ChatPromptTimelineItem,
} from "@renderer/utils/chat-prompt-timeline";
import type { Session } from "@shared/types/chat";

interface UsePromptTimelineInput {
  activeSession: Readonly<Ref<Session | null | undefined>>;
  activeSessionId: Readonly<Ref<string | null>>;
  isLoadingMessages: Readonly<Ref<boolean>>;
  messageScrollContainerRef: Ref<HTMLElement | null>;
}

function escapeSelectorValue(value: string): string {
  return CSS.escape(value);
}

function findUserPromptAnchor(container: HTMLElement, messageId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-chat-user-message-id="${escapeSelectorValue(messageId)}"]`
  );
}

export function usePromptTimeline(options: UsePromptTimelineInput): {
  promptTimelineItems: ComputedRef<ChatPromptTimelineItem[]>;
  activePromptTimelineItemId: Ref<string | null>;
  showPromptTimeline: ComputedRef<boolean>;
  locateUserPrompt: (messageId: string) => Promise<void>;
} {
  const activePromptTimelineItemId = ref<string | null>(null);
  const promptTimelineItems = computed(() =>
    collectChatPromptTimelineItems(options.activeSession.value?.messages ?? [])
  );
  const promptTimelineItemIds = computed(() => promptTimelineItems.value.map((item) => item.id));
  const showPromptTimeline = computed(
    () =>
      options.activeSessionId.value !== null &&
      !options.isLoadingMessages.value &&
      promptTimelineItems.value.length > 1
  );

  let removeScrollListener: (() => void) | null = null;

  function updateActivePromptTimelineItem(): void {
    const items = promptTimelineItems.value;
    if (items.length === 0) {
      activePromptTimelineItemId.value = null;
      return;
    }

    const container = options.messageScrollContainerRef.value;
    if (!container) {
      activePromptTimelineItemId.value = items[0]?.id ?? null;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    // Anchor the activation line at 35% of the viewport so the active timeline
    // item reflects what the user is currently reading rather than the top edge.
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

  // Re-bind the passive scroll listener whenever the scroll container changes.
  // The previous listener is always removed first to avoid leaks during swaps.
  function bindScrollListener(): void {
    removeScrollListener?.();
    removeScrollListener = null;

    const container = options.messageScrollContainerRef.value;
    if (!container) {
      return;
    }

    const handleScroll = (): void => {
      updateActivePromptTimelineItem();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    removeScrollListener = () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }

  async function locateUserPrompt(messageId: string): Promise<void> {
    await nextTick();

    const container = options.messageScrollContainerRef.value;
    if (!container) {
      return;
    }

    const target = findUserPromptAnchor(container, messageId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    activePromptTimelineItemId.value = messageId;
  }

  watch(
    () => options.messageScrollContainerRef.value,
    () => {
      bindScrollListener();
      void nextTick(() => {
        updateActivePromptTimelineItem();
      });
    },
    { flush: "post" }
  );

  watch(
    [promptTimelineItemIds, options.activeSessionId, options.isLoadingMessages],
    () => {
      void nextTick(() => {
        updateActivePromptTimelineItem();
      });
    },
    { flush: "post", immediate: true }
  );

  onBeforeUnmount(() => {
    removeScrollListener?.();
  });

  return {
    promptTimelineItems,
    activePromptTimelineItemId,
    showPromptTimeline,
    locateUserPrompt,
  };
}
