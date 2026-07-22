import { computed, nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  collectChatPromptTimelineItems,
  type ChatPromptTimelineItem,
} from "@renderer/utils/chat-prompt-timeline";
import type { Session } from "@shared/types/chat";

const READING_LINE_RATIO = 0.35;
const NAVIGATION_TOLERANCE_PX = 3;
const NAVIGATION_FALLBACK_MS = 1200;

export type PromptTimelineNavigationIntent = "smooth" | "immediate";

interface UsePromptTimelineInput {
  activeSession: Readonly<Ref<Session | null | undefined>>;
  activeSessionId: Readonly<Ref<string | null>>;
  isLoadingMessages: Readonly<Ref<boolean>>;
  messageContentRef: Ref<HTMLElement | null>;
  messageScrollContainerRef: Ref<HTMLElement | null>;
}

interface PromptAnchorOffset {
  itemId: string;
  messageId: string;
  offset: number;
}

function escapeSelectorValue(value: string): string {
  return CSS.escape(value);
}

function findUserPromptAnchor(container: HTMLElement, messageId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-chat-user-message-id="${escapeSelectorValue(messageId)}"]`
  );
}

function findActiveAnchorIndex(offsets: PromptAnchorOffset[], readingLine: number): number {
  let low = 0;
  let high = offsets.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const offset = offsets[middle]?.offset ?? Number.POSITIVE_INFINITY;
    if (offset <= readingLine) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, result);
}

function targetScrollTop(container: HTMLElement, anchorOffset: number): number {
  const desired = anchorOffset - container.clientHeight * READING_LINE_RATIO;
  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  return Math.max(0, Math.min(maximum, desired));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function usePromptTimeline(options: UsePromptTimelineInput): {
  promptTimelineItems: ComputedRef<ChatPromptTimelineItem[]>;
  activePromptTimelineItemId: Ref<string | null>;
  showPromptTimeline: ComputedRef<boolean>;
  locateUserPrompt: (messageId: string, intent?: PromptTimelineNavigationIntent) => Promise<void>;
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

  let anchorOffsets: PromptAnchorOffset[] = [];
  let measureFrameId: number | null = null;
  let scrollFrameId: number | null = null;
  let navigationFallbackTimer: number | null = null;
  let navigationTargetId: string | null = null;
  let removeScrollListener: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function clearNavigationLock(): void {
    navigationTargetId = null;
    if (navigationFallbackTimer !== null) {
      window.clearTimeout(navigationFallbackTimer);
      navigationFallbackTimer = null;
    }
  }

  function lockNavigation(itemId: string): void {
    clearNavigationLock();
    navigationTargetId = itemId;
    navigationFallbackTimer = window.setTimeout(() => {
      navigationFallbackTimer = null;
      navigationTargetId = null;
      scheduleActiveSync();
    }, NAVIGATION_FALLBACK_MS);
  }

  function syncActivePromptTimelineItem(): void {
    const items = promptTimelineItems.value;
    if (items.length === 0) {
      activePromptTimelineItemId.value = null;
      return;
    }

    const container = options.messageScrollContainerRef.value;
    if (!container || anchorOffsets.length === 0) {
      activePromptTimelineItemId.value = items[0]?.id ?? null;
      return;
    }

    if (navigationTargetId !== null) {
      const target = anchorOffsets.find((anchor) => anchor.itemId === navigationTargetId);
      if (target) {
        const distance = Math.abs(container.scrollTop - targetScrollTop(container, target.offset));
        if (distance > NAVIGATION_TOLERANCE_PX) {
          activePromptTimelineItemId.value = navigationTargetId;
          return;
        }
      }
      clearNavigationLock();
    }

    const readingLine = container.scrollTop + container.clientHeight * READING_LINE_RATIO;
    const activeIndex = findActiveAnchorIndex(anchorOffsets, readingLine);
    activePromptTimelineItemId.value = anchorOffsets[activeIndex]?.itemId ?? items[0]?.id ?? null;
  }

  function scheduleActiveSync(): void {
    if (scrollFrameId !== null) {
      return;
    }

    scrollFrameId = window.requestAnimationFrame(() => {
      scrollFrameId = null;
      syncActivePromptTimelineItem();
    });
  }

  function measurePromptAnchors(): void {
    measureFrameId = null;
    const container = options.messageScrollContainerRef.value;
    if (!container) {
      anchorOffsets = [];
      syncActivePromptTimelineItem();
      return;
    }

    const containerRect = container.getBoundingClientRect();
    anchorOffsets = promptTimelineItems.value
      .flatMap((item): PromptAnchorOffset[] => {
        const anchor = findUserPromptAnchor(container, item.messageId);
        if (!anchor) {
          return [];
        }

        return [
          {
            itemId: item.id,
            messageId: item.messageId,
            offset: anchor.getBoundingClientRect().top - containerRect.top + container.scrollTop,
          },
        ];
      })
      .sort((left, right) => left.offset - right.offset);
    scheduleActiveSync();
  }

  function scheduleAnchorMeasurement(): void {
    if (measureFrameId !== null) {
      return;
    }

    measureFrameId = window.requestAnimationFrame(measurePromptAnchors);
  }

  function cancelScheduledWork(): void {
    if (measureFrameId !== null) {
      window.cancelAnimationFrame(measureFrameId);
      measureFrameId = null;
    }
    if (scrollFrameId !== null) {
      window.cancelAnimationFrame(scrollFrameId);
      scrollFrameId = null;
    }
  }

  function releaseRuntimeBindings(): void {
    removeScrollListener?.();
    removeScrollListener = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    cancelScheduledWork();
    clearNavigationLock();
  }

  function bindRuntime(): void {
    releaseRuntimeBindings();
    anchorOffsets = [];

    const container = options.messageScrollContainerRef.value;
    if (!container) {
      syncActivePromptTimelineItem();
      return;
    }

    const handleScroll = (): void => {
      scheduleActiveSync();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    removeScrollListener = () => {
      container.removeEventListener("scroll", handleScroll);
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleAnchorMeasurement();
      });
      resizeObserver.observe(container);
      const content = options.messageContentRef.value;
      if (content && content !== container) {
        resizeObserver.observe(content);
      }
    }

    scheduleAnchorMeasurement();
  }

  async function locateUserPrompt(
    messageId: string,
    intent: PromptTimelineNavigationIntent = "smooth"
  ): Promise<void> {
    await nextTick();

    const container = options.messageScrollContainerRef.value;
    const item = promptTimelineItems.value.find((candidate) => candidate.messageId === messageId);
    if (!container || !item) {
      return;
    }

    let target = anchorOffsets.find((anchor) => anchor.messageId === messageId);
    if (!target) {
      measurePromptAnchors();
      target = anchorOffsets.find((anchor) => anchor.messageId === messageId);
    }
    if (!target) {
      return;
    }

    const behavior: ScrollBehavior =
      intent === "immediate" || prefersReducedMotion() ? "auto" : "smooth";
    if (behavior === "smooth") {
      lockNavigation(item.id);
    } else {
      clearNavigationLock();
    }

    activePromptTimelineItemId.value = item.id;
    container.scrollTo({ top: targetScrollTop(container, target.offset), behavior });
  }

  watch(
    [() => options.messageScrollContainerRef.value, () => options.messageContentRef.value],
    () => {
      bindRuntime();
    },
    { flush: "post", immediate: true }
  );

  watch(
    [promptTimelineItemIds, options.activeSessionId, options.isLoadingMessages],
    () => {
      void nextTick(() => {
        scheduleAnchorMeasurement();
      });
    },
    { flush: "post", immediate: true }
  );

  onBeforeUnmount(() => {
    releaseRuntimeBindings();
  });

  return {
    promptTimelineItems,
    activePromptTimelineItemId,
    showPromptTimeline,
    locateUserPrompt,
  };
}
