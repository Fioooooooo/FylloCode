<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { PromptTimelineNavigationIntent } from "@renderer/composables/usePromptTimeline";
import type { ChatPromptTimelineItem } from "@renderer/utils/chat-prompt-timeline";

const LINE_STEP_PX = 6;
const PREVIEW_CLOSE_DELAY_MS = 180;
const PREVIEW_COUNT = 3;
const PREVIEW_REOPEN_SUPPRESSION_MS = 300;

const props = defineProps<{
  items: ChatPromptTimelineItem[];
  activeItemId: string | null;
}>();

const emit = defineEmits<{
  "locate-prompt": [messageId: string, intent: PromptTimelineNavigationIntent];
}>();

const railRef = ref<HTMLElement | null>(null);
const previewItemId = ref<string | null>(null);
const previewWindowAnchorIndex = ref<number | null>(null);
const keyboardCursorIndex = ref<number | null>(null);
const popoverOpen = ref(false);

let previewCloseTimer: number | null = null;
let pointerId: number | null = null;
let pointerIndex = -1;
let pointerMoved = false;
let pointerPreviewSuppressedUntil = 0;

const previewIndex = computed(() =>
  props.items.findIndex((item) => item.id === previewItemId.value)
);
const activeIndex = computed(() => props.items.findIndex((item) => item.id === props.activeItemId));
const nearbyPreviewItems = computed(() => {
  const anchorIndex = previewWindowAnchorIndex.value ?? previewIndex.value;
  if (anchorIndex < 0) {
    return [];
  }

  const visibleCount = Math.min(PREVIEW_COUNT, props.items.length);
  const start = Math.max(0, Math.min(props.items.length - visibleCount, anchorIndex - 1));
  return props.items.slice(start, start + visibleCount);
});
const activeDescendantId = computed(() => {
  const itemId = previewItemId.value ?? props.activeItemId;
  return itemId ? lineElementId(itemId) : undefined;
});

function lineElementId(itemId: string): string {
  return `chat-prompt-timeline-${itemId}`;
}

function isActive(item: ChatPromptTimelineItem): boolean {
  return props.activeItemId === item.id;
}

function isPreview(item: ChatPromptTimelineItem): boolean {
  return previewItemId.value === item.id;
}

function clearPreviewCloseTimer(): void {
  if (previewCloseTimer !== null) {
    window.clearTimeout(previewCloseTimer);
    previewCloseTimer = null;
  }
}

function ensureIndexVisible(index: number): void {
  const rail = railRef.value;
  if (!rail || index < 0) {
    return;
  }

  const top = index * LINE_STEP_PX;
  const bottom = top + LINE_STEP_PX;
  if (top < rail.scrollTop) {
    rail.scrollTop = top;
  } else if (bottom > rail.scrollTop + rail.clientHeight) {
    rail.scrollTop = bottom - rail.clientHeight;
  }
}

function showPreview(index: number, options: { updateWindowAnchor?: boolean } = {}): void {
  const item = props.items[index];
  if (!item) {
    return;
  }

  clearPreviewCloseTimer();
  if (options.updateWindowAnchor !== false) {
    previewWindowAnchorIndex.value = index;
  }
  previewItemId.value = item.id;
  keyboardCursorIndex.value = index;
  popoverOpen.value = true;
  void nextTick(() => ensureIndexVisible(index));
}

function closePreview(): void {
  clearPreviewCloseTimer();
  popoverOpen.value = false;
  previewItemId.value = null;
  previewWindowAnchorIndex.value = null;
}

function closePreviewSoon(): void {
  clearPreviewCloseTimer();
  previewCloseTimer = window.setTimeout(() => {
    previewCloseTimer = null;
    closePreview();
  }, PREVIEW_CLOSE_DELAY_MS);
}

function suppressPointerPreviewReopen(): void {
  pointerPreviewSuppressedUntil = Date.now() + PREVIEW_REOPEN_SUPPRESSION_MS;
}

function clearPointerPreviewReopenSuppression(): void {
  pointerPreviewSuppressedUntil = 0;
}

function indexFromPointer(event: PointerEvent): number {
  const rail = railRef.value;
  if (!rail || props.items.length === 0) {
    return -1;
  }

  const localY = event.clientY - rail.getBoundingClientRect().top + rail.scrollTop;
  return Math.max(0, Math.min(props.items.length - 1, Math.round(localY / LINE_STEP_PX)));
}

function handlePointerMove(event: PointerEvent): void {
  if (Date.now() < pointerPreviewSuppressedUntil) {
    return;
  }

  const index = indexFromPointer(event);
  if (index < 0) {
    return;
  }

  showPreview(index);
  if (pointerId === event.pointerId && index !== pointerIndex) {
    pointerMoved = true;
    pointerIndex = index;
    const item = props.items[index];
    if (item) {
      emit("locate-prompt", item.messageId, "immediate");
    }
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (typeof event.button === "number" && event.button !== 0) {
    return;
  }

  const index = indexFromPointer(event);
  if (index < 0) {
    return;
  }

  event.preventDefault();
  clearPointerPreviewReopenSuppression();
  clearPreviewCloseTimer();
  pointerId = event.pointerId;
  pointerIndex = index;
  pointerMoved = false;
  showPreview(index);
  railRef.value?.setPointerCapture?.(event.pointerId);
}

function releasePointer(event: PointerEvent, locateClick: boolean): void {
  if (pointerId !== event.pointerId) {
    return;
  }

  const rail = railRef.value;
  if (rail?.hasPointerCapture?.(event.pointerId)) {
    rail.releasePointerCapture(event.pointerId);
  }

  if (locateClick && !pointerMoved) {
    const index = indexFromPointer(event);
    const item = props.items[index];
    if (item) {
      showPreview(index);
      emit("locate-prompt", item.messageId, "smooth");
    }
  }

  pointerId = null;
  pointerIndex = -1;
  pointerMoved = false;
}

function handleFocus(): void {
  clearPointerPreviewReopenSuppression();
  const index = keyboardCursorIndex.value ?? Math.max(0, activeIndex.value);
  showPreview(index);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  if (event.key === "Escape") {
    closePreview();
    return;
  }

  const currentIndex = keyboardCursorIndex.value ?? Math.max(0, activeIndex.value);
  if (event.key === "Enter") {
    const item = props.items[currentIndex];
    if (item) {
      emit("locate-prompt", item.messageId, "smooth");
    }
    return;
  }

  let nextIndex = currentIndex;
  if (event.key === "ArrowUp") {
    nextIndex = Math.max(0, currentIndex - 1);
  } else if (event.key === "ArrowDown") {
    nextIndex = Math.min(props.items.length - 1, currentIndex + 1);
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = props.items.length - 1;
  }
  showPreview(nextIndex);
}

function locateFromPreview(item: ChatPromptTimelineItem): void {
  showPreview(props.items.findIndex((candidate) => candidate.id === item.id));
  emit("locate-prompt", item.messageId, "smooth");
  suppressPointerPreviewReopen();
  closePreview();
}

function preventPopoverAutoFocus(event: Event): void {
  event.preventDefault();
}

function handlePopoverOpenChange(open: boolean): void {
  if (!open) {
    closePreview();
  }
}

watch(
  () => props.activeItemId,
  (itemId) => {
    if (!itemId) {
      return;
    }
    const index = props.items.findIndex((item) => item.id === itemId);
    void nextTick(() => ensureIndexVisible(index));
  }
);

watch(
  () => props.items,
  () => {
    if (previewItemId.value && !props.items.some((item) => item.id === previewItemId.value)) {
      closePreview();
      keyboardCursorIndex.value = null;
    } else if (
      previewWindowAnchorIndex.value !== null &&
      !props.items[previewWindowAnchorIndex.value]
    ) {
      previewWindowAnchorIndex.value = previewIndex.value >= 0 ? previewIndex.value : null;
    }
  }
);

onBeforeUnmount(() => {
  clearPreviewCloseTimer();
});
</script>

<template>
  <div class="inline-flex h-full max-h-full items-start">
    <UPopover
      :open="popoverOpen && nearbyPreviewItems.length > 0"
      :content="{
        align: 'start',
        side: 'right',
        sideOffset: 8,
        onCloseAutoFocus: preventPopoverAutoFocus,
        onOpenAutoFocus: preventPopoverAutoFocus,
      }"
      :ui="{ content: 'w-64 p-1' }"
      :portal="true"
      @update:open="handlePopoverOpenChange"
    >
      <template #default>
        <nav
          ref="railRef"
          class="max-h-full w-9 shrink-0 touch-none overflow-y-auto rounded-md py-0 pl-1.5 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [&::-webkit-scrollbar]:hidden"
          aria-label="用户 prompt 时间线"
          :aria-activedescendant="activeDescendantId"
          data-test="chat-prompt-timeline"
          tabindex="0"
          @focus="handleFocus"
          @keydown="handleKeydown"
          @pointermove="handlePointerMove"
          @pointerdown="handlePointerDown"
          @pointerup="releasePointer($event, true)"
          @pointercancel="releasePointer($event, false)"
          @pointerleave="pointerId === null && closePreviewSoon()"
        >
          <div
            class="relative ml-0.5 w-[22px]"
            :style="{ height: `${Math.max(LINE_STEP_PX, props.items.length * LINE_STEP_PX)}px` }"
          >
            <span
              v-for="(item, index) in props.items"
              :id="lineElementId(item.id)"
              :key="item.id"
              role="link"
              class="pointer-events-none absolute left-0 h-0.5 rounded-full transition-[width,background-color] duration-150 motion-reduce:transition-none"
              :class="
                isActive(item)
                  ? 'w-[22px] bg-primary'
                  : isPreview(item)
                    ? 'w-[22px] bg-accented'
                    : 'w-[14px] bg-accented'
              "
              :style="{ top: `${index * LINE_STEP_PX + 2}px` }"
              :aria-label="item.preview"
              :aria-current="isActive(item) ? 'true' : undefined"
              :data-item-id="item.id"
              :data-offset="index * LINE_STEP_PX"
              :data-preview="isPreview(item) ? 'true' : 'false'"
              :data-state="isActive(item) ? 'active' : 'inactive'"
              data-test="chat-prompt-timeline-item"
            ></span>
          </div>
        </nav>
      </template>

      <template #content>
        <div
          data-test="chat-prompt-timeline-popover"
          @pointerenter="clearPreviewCloseTimer"
          @pointerleave="closePreviewSoon"
        >
          <button
            v-for="item in nearbyPreviewItems"
            :key="item.id"
            type="button"
            class="w-full border-l-2 px-3 py-2 text-left text-xs leading-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
            :class="
              isPreview(item)
                ? 'border-primary bg-primary/10 text-default'
                : 'border-transparent text-muted hover:bg-elevated hover:text-default'
            "
            data-test="chat-prompt-timeline-preview"
            @pointerenter="
              showPreview(
                props.items.findIndex((candidate) => candidate.id === item.id),
                {
                  updateWindowAnchor: false,
                }
              )
            "
            @click="locateFromPreview(item)"
          >
            <span
              class="line-clamp-2 max-h-8 overflow-hidden whitespace-normal break-words"
              data-test="chat-prompt-timeline-preview-text"
            >
              {{ item.preview }}
            </span>
          </button>
        </div>
      </template>
    </UPopover>
  </div>
</template>
