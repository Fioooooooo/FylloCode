<script setup lang="ts">
import type { UIMessage } from "ai";
import { isTextUIPart } from "ai";
import type { ComponentPublicInstance } from "vue";
import { nextTick, onMounted, reactive, watch } from "vue";
import { useUserImagePart } from "@renderer/composables/useUserImagePart";
import { isUserFilePart, isUserImagePart } from "@renderer/utils/chat-message-parts";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";

const props = defineProps<{
  message: UIMessage;
}>();

const { getImageSrc } = useUserImagePart({
  messageId: () => props.message.id,
  parts: () => props.message.parts,
});

const expandedTextParts = reactive<Record<string, boolean>>({});
const overflowingTextParts = reactive<Record<string, boolean | undefined>>({});
const textPartElements = new Map<string, HTMLElement>();

const textBubbleBaseClass =
  "whitespace-pre-wrap wrap-anywhere relative text-pretty px-4 py-3 rounded-lg min-h-12 bg-elevated/50 border border-default";

function getTextPartKey(part: UIMessage["parts"][number], index: number): string {
  return `${props.message.id}-${part.type}-${index}`;
}

function isTextPartExpanded(key: string): boolean {
  return expandedTextParts[key] === true;
}

function isTextPartOverflowing(key: string): boolean {
  return overflowingTextParts[key] === true;
}

function shouldConstrainTextPart(key: string): boolean {
  return !isTextPartExpanded(key) && overflowingTextParts[key] !== false;
}

function getTextBubbleClasses(key: string): string[] {
  return [textBubbleBaseClass, shouldConstrainTextPart(key) ? "max-h-40 overflow-hidden" : ""];
}

function setTextPartElement(key: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) {
    textPartElements.set(key, element);
    void measureTextPart(key);
    return;
  }

  textPartElements.delete(key);
  delete expandedTextParts[key];
  delete overflowingTextParts[key];
}

async function measureTextPart(key: string): Promise<void> {
  await nextTick();

  const element = textPartElements.get(key);
  if (!element || isTextPartExpanded(key)) {
    return;
  }

  const isOverflowing = element.scrollHeight > element.clientHeight + 1;
  overflowingTextParts[key] = isOverflowing;

  if (!isOverflowing) {
    delete expandedTextParts[key];
  }
}

function measureAllTextParts(): void {
  for (const key of textPartElements.keys()) {
    void measureTextPart(key);
  }
}

function toggleTextPart(key: string): void {
  expandedTextParts[key] = !isTextPartExpanded(key);
}

onMounted(() => {
  measureAllTextParts();
});

watch(
  () => props.message.parts,
  () => {
    measureAllTextParts();
  },
  { deep: true, flush: "post" }
);

function getFilePartName(part: UIMessage["parts"][number]): string {
  const value = (part as { filename?: unknown }).filename;
  return typeof value === "string" ? value : "附件";
}

function getFilePartExtension(part: UIMessage["parts"][number]): string {
  const filename = getFilePartName(part);
  const extension = filename.includes(".") ? filename.split(".").at(-1) : "";
  return extension ? extension.toUpperCase() : "FILE";
}
</script>

<template>
  <div class="flex max-w-full flex-col items-end gap-2">
    <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
      <div
        v-if="isTextUIPart(part) && !isSystemReminderPart(part)"
        class="flex max-w-full flex-col items-end"
      >
        <p
          :ref="(element) => setTextPartElement(getTextPartKey(part, index), element)"
          data-test="user-message-text"
          :data-text-part-key="getTextPartKey(part, index)"
          :class="getTextBubbleClasses(getTextPartKey(part, index))"
        >
          {{ part.text }}
        </p>

        <button
          v-if="isTextPartOverflowing(getTextPartKey(part, index))"
          type="button"
          data-test="user-message-text-toggle"
          class="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-elevated/60 hover:text-highlighted"
          :aria-expanded="isTextPartExpanded(getTextPartKey(part, index))"
          @click="toggleTextPart(getTextPartKey(part, index))"
        >
          <span>{{ isTextPartExpanded(getTextPartKey(part, index)) ? "收起" : "展开" }}</span>
          <UIcon
            :name="
              isTextPartExpanded(getTextPartKey(part, index))
                ? 'i-lucide-chevron-up'
                : 'i-lucide-chevron-down'
            "
            class="h-3.5 w-3.5"
          />
        </button>
      </div>

      <div
        v-else-if="isUserImagePart(part)"
        data-test="user-message-image-card"
        class="relative h-32 w-32 overflow-hidden rounded-lg border border-default bg-elevated/50"
      >
        <img
          :src="getImageSrc(index)"
          :alt="getFilePartName(part)"
          class="h-full w-full object-cover"
        />
      </div>

      <div
        v-else-if="isUserFilePart(part)"
        data-test="user-message-file-card"
        class="flex min-w-64 max-w-full items-center gap-3 rounded-lg border border-default bg-elevated/50 p-2"
      >
        <div
          class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
        >
          <UIcon name="i-lucide-file" class="h-5 w-5" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ getFilePartName(part) }}
          </p>
          <div class="flex items-center gap-2 text-xs text-muted">
            <span>{{ getFilePartExtension(part) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
