<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { PromptTimelineNavigationIntent } from "@renderer/composables/usePromptTimeline";
import type { ChatPromptTimelineItem } from "@renderer/utils/chat-prompt-timeline";

const MAX_GUIDE_COUNT = 10;
const SHORT_GUIDE_STEP_PX = 14;
const MIN_RAIL_HEIGHT_PX = 36;
const LONG_RAIL_HEIGHT_PX = 164;
const GUIDE_HEIGHT_PX = 2;
const PREVIEW_CLOSE_DELAY_MS = 180;
const TRANSIENT_PREVIEW_COUNT = 5;

const props = defineProps<{
  items: ChatPromptTimelineItem[];
  activeItemId: string | null;
}>();

const emit = defineEmits<{
  "locate-prompt": [messageId: string, intent: PromptTimelineNavigationIntent];
}>();

const railRef = ref<HTMLElement | null>(null);
const previewListRef = ref<HTMLElement | null>(null);
const previewIndex = ref<number | null>(null);
const pinned = ref(false);
const dragging = ref(false);
const popoverOpen = ref(false);

let previewCloseTimer: number | null = null;
let pointerId: number | null = null;
let pointerIndex = -1;
let pointerMoved = false;

const activeIndex = computed(() => props.items.findIndex((item) => item.id === props.activeItemId));
const guideCount = computed(() => Math.min(props.items.length, MAX_GUIDE_COUNT));
const railHeightPx = computed(() => {
  if (props.items.length > MAX_GUIDE_COUNT) {
    return LONG_RAIL_HEIGHT_PX;
  }

  return Math.max(MIN_RAIL_HEIGHT_PX, (guideCount.value - 1) * SHORT_GUIDE_STEP_PX);
});
const guideOffsets = computed(() => {
  if (guideCount.value <= 1) {
    return [0];
  }

  const availableHeight = railHeightPx.value - GUIDE_HEIGHT_PX;
  return Array.from(
    { length: guideCount.value },
    (_, index) => (index / (guideCount.value - 1)) * availableHeight
  );
});
const activeThumbRatio = computed(() => {
  if (props.items.length <= 1 || activeIndex.value < 0) {
    return 0;
  }

  return activeIndex.value / (props.items.length - 1);
});
const activeThumbOffset = computed(
  () => activeThumbRatio.value * (railHeightPx.value - GUIDE_HEIGHT_PX)
);
const ariaIndex = computed(() => {
  if (previewIndex.value !== null) {
    return previewIndex.value;
  }

  return Math.max(0, activeIndex.value);
});
const displayedPreviewItems = computed(() => {
  if (previewIndex.value === null) {
    return [];
  }
  if (pinned.value) {
    return props.items;
  }

  const visibleCount = Math.min(TRANSIENT_PREVIEW_COUNT, props.items.length);
  const halfWindow = Math.floor(visibleCount / 2);
  const start = Math.max(
    0,
    Math.min(props.items.length - visibleCount, previewIndex.value - halfWindow)
  );
  return props.items.slice(start, start + visibleCount);
});

function clearPreviewCloseTimer(): void {
  if (previewCloseTimer !== null) {
    window.clearTimeout(previewCloseTimer);
    previewCloseTimer = null;
  }
}

function selectedRow(): HTMLElement | null {
  const item = previewIndex.value === null ? undefined : props.items[previewIndex.value];
  if (!item) {
    return null;
  }

  return (
    Array.from(
      previewListRef.value?.querySelectorAll<HTMLElement>(
        '[data-test="chat-prompt-timeline-preview"]'
      ) ?? []
    ).find((row) => row.dataset.itemId === item.id) ?? null
  );
}

function scrollSelectedIntoView(): void {
  if (!pinned.value) {
    return;
  }

  void nextTick(() => {
    selectedRow()?.scrollIntoView?.({ block: "nearest" });
  });
}

function showPreview(index: number): void {
  if (!props.items[index]) {
    return;
  }

  clearPreviewCloseTimer();
  previewIndex.value = index;
  popoverOpen.value = true;
  scrollSelectedIntoView();
}

function pinPreview(index = previewIndex.value): void {
  if (index === null || !props.items[index]) {
    return;
  }

  clearPreviewCloseTimer();
  previewIndex.value = index;
  pinned.value = true;
  popoverOpen.value = true;
  scrollSelectedIntoView();
}

function closePopover(): void {
  clearPreviewCloseTimer();
  popoverOpen.value = false;
  pinned.value = false;
  previewIndex.value = null;
}

function closeTransientPreviewSoon(): void {
  if (pinned.value) {
    return;
  }

  clearPreviewCloseTimer();
  previewCloseTimer = window.setTimeout(() => {
    previewCloseTimer = null;
    closePopover();
  }, PREVIEW_CLOSE_DELAY_MS);
}

function indexFromPointer(event: PointerEvent): number {
  const rail = railRef.value;
  if (!rail || props.items.length === 0) {
    return -1;
  }

  const rect = rail.getBoundingClientRect();
  if (rect.height <= 0) {
    return 0;
  }

  const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  return Math.round(ratio * (props.items.length - 1));
}

function handlePointerMove(event: PointerEvent): void {
  const index = indexFromPointer(event);
  if (index < 0) {
    return;
  }

  showPreview(index);
  if (pointerId === event.pointerId && index !== pointerIndex) {
    dragging.value = true;
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
  clearPreviewCloseTimer();
  pointerId = event.pointerId;
  pointerIndex = index;
  pointerMoved = false;
  dragging.value = false;
  showPreview(index);
  railRef.value?.setPointerCapture?.(event.pointerId);
}

function releasePointerCapture(): void {
  const rail = railRef.value;
  if (pointerId !== null && rail?.hasPointerCapture?.(pointerId)) {
    rail.releasePointerCapture(pointerId);
  }
}

function releasePointer(event: PointerEvent, locateClick: boolean): void {
  if (pointerId !== event.pointerId) {
    return;
  }

  releasePointerCapture();
  const index = indexFromPointer(event);
  if (locateClick && index >= 0) {
    const item = props.items[index];
    if (item) {
      showPreview(index);
      if (!pointerMoved) {
        emit("locate-prompt", item.messageId, "smooth");
      }
      pinPreview(index);
    }
  }

  pointerId = null;
  pointerIndex = -1;
  pointerMoved = false;
  dragging.value = false;
}

function handleWheel(event: WheelEvent): void {
  if (event.deltaY === 0) {
    return;
  }

  event.preventDefault();
  const currentIndex = previewIndex.value ?? Math.max(0, activeIndex.value);
  const nextIndex = Math.max(
    0,
    Math.min(props.items.length - 1, currentIndex + (event.deltaY > 0 ? 1 : -1))
  );
  showPreview(nextIndex);
  const item = props.items[nextIndex];
  if (item) {
    emit("locate-prompt", item.messageId, "immediate");
  }
}

function handleFocus(): void {
  showPreview(Math.max(0, activeIndex.value));
}

function handleKeydown(event: KeyboardEvent): void {
  if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  if (event.key === "Escape") {
    closePopover();
    return;
  }

  const currentIndex = previewIndex.value ?? Math.max(0, activeIndex.value);
  if (event.key === "Enter") {
    const item = props.items[currentIndex];
    if (item) {
      showPreview(currentIndex);
      emit("locate-prompt", item.messageId, "smooth");
      pinPreview(currentIndex);
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
  const index = props.items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) {
    return;
  }

  showPreview(index);
  emit("locate-prompt", item.messageId, "smooth");
  pinPreview(index);
}

function preventPopoverAutoFocus(event: Event): void {
  event.preventDefault();
}

function handlePopoverOpenChange(open: boolean): void {
  if (!open) {
    closePopover();
  }
}

watch(
  () => props.items,
  (items, previousItems) => {
    if (previewIndex.value === null) {
      return;
    }

    const previousItemId = previousItems[previewIndex.value]?.id;
    const currentItemId = items[previewIndex.value]?.id;
    if (!currentItemId || (previousItemId && currentItemId !== previousItemId)) {
      closePopover();
    }
  }
);

onBeforeUnmount(() => {
  clearPreviewCloseTimer();
  releasePointerCapture();
  dragging.value = false;
});
</script>

<template>
  <div
    class="inline-flex h-fit min-h-0 w-11 flex-col items-start rounded-md border border-transparent bg-transparent p-1 shadow-none transition-colors duration-150 hover:border-default/50 hover:bg-default/80 focus-within:border-default/50 focus-within:bg-default/80 motion-reduce:transition-none"
    :class="dragging ? 'border-default/50 bg-default/80' : ''"
    data-test="chat-prompt-timeline-surface"
  >
    <UPopover
      :open="popoverOpen && displayedPreviewItems.length > 0"
      :content="{
        align: 'start',
        side: 'right',
        sideOffset: 8,
        onCloseAutoFocus: preventPopoverAutoFocus,
        onOpenAutoFocus: preventPopoverAutoFocus,
      }"
      :ui="{ content: 'w-72 p-2' }"
      :portal="true"
      @update:open="handlePopoverOpenChange"
    >
      <template #default>
        <div
          ref="railRef"
          role="slider"
          class="relative w-9 shrink-0 touch-none rounded-md focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          aria-label="用户 prompt 时间线"
          aria-orientation="vertical"
          aria-valuemin="1"
          :aria-valuemax="props.items.length"
          :aria-valuenow="ariaIndex + 1"
          :aria-valuetext="`第 ${ariaIndex + 1} 条 prompt，共 ${props.items.length} 条`"
          data-test="chat-prompt-timeline"
          :data-rail-height="railHeightPx"
          :style="{ height: `${railHeightPx}px` }"
          tabindex="0"
          @focus="handleFocus"
          @keydown="handleKeydown"
          @pointermove="handlePointerMove"
          @pointerdown="handlePointerDown"
          @pointerup="releasePointer($event, true)"
          @pointercancel="releasePointer($event, false)"
          @pointerleave="pointerId === null && closeTransientPreviewSoon()"
          @wheel="handleWheel"
        >
          <span
            v-for="(offset, index) in guideOffsets"
            :key="index"
            aria-hidden="true"
            class="pointer-events-none absolute left-1.5 h-0.5 w-[18px] rounded-full bg-accented"
            :style="{ top: `${offset}px` }"
            :data-offset="offset"
            data-test="chat-prompt-timeline-guide"
          ></span>

          <span
            aria-hidden="true"
            class="pointer-events-none absolute left-1 h-0.5 w-[22px] rounded-full bg-primary"
            :style="{ top: `${activeThumbOffset}px` }"
            :data-active-ratio="activeThumbRatio"
            data-test="chat-prompt-timeline-thumb"
          ></span>
        </div>
      </template>

      <template #content>
        <div
          data-test="chat-prompt-timeline-popover"
          @pointerenter="clearPreviewCloseTimer"
          @pointerleave="closeTransientPreviewSoon"
        >
          <div class="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
            <div class="min-w-0">
              <p class="truncate text-xs font-medium text-highlighted">
                {{ pinned ? "全部 user prompts" : "附近 prompts" }}
              </p>
              <p class="text-[11px] text-muted">{{ ariaIndex + 1 }} / {{ props.items.length }}</p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-md border border-default/50 bg-transparent px-2 py-1 text-xs text-muted transition-colors duration-150 hover:border-default hover:bg-elevated hover:text-default focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="pinned ? '关闭 prompt 列表' : '显示全部 user prompts'"
              data-test="chat-prompt-timeline-popover-action"
              @click="pinned ? closePopover() : pinPreview()"
            >
              {{ pinned ? "关闭" : "显示全部" }}
            </button>
          </div>

          <div
            ref="previewListRef"
            :class="pinned ? 'max-h-72 overflow-y-auto' : ''"
            data-test="chat-prompt-timeline-preview-list"
            :data-mode="pinned ? 'pinned' : 'transient'"
          >
            <button
              v-for="item in displayedPreviewItems"
              :key="item.id"
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
              :class="
                previewIndex !== null && props.items[previewIndex]?.id === item.id
                  ? 'bg-primary/10 text-default'
                  : 'text-muted hover:bg-elevated hover:text-default'
              "
              :data-item-id="item.id"
              :data-selected="
                previewIndex !== null && props.items[previewIndex]?.id === item.id
                  ? 'true'
                  : 'false'
              "
              data-test="chat-prompt-timeline-preview"
              @click="locateFromPreview(item)"
            >
              <span class="w-6 shrink-0 text-right tabular-nums text-muted">
                {{ item.index }}
              </span>
              <span class="min-w-0 flex-1 truncate" data-test="chat-prompt-timeline-preview-text">
                {{ item.preview }}
              </span>
            </button>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
