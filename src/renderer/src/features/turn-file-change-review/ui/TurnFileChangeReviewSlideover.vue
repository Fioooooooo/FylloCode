<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { TurnFileChangeReviewController } from "../application/turn-file-change-review-controller";
import type { TurnFileChangeKind } from "../model/turn-file-changes";
import TurnFileDiffPanel from "./TurnFileDiffPanel.vue";

const props = defineProps<{
  controller: TurnFileChangeReviewController;
}>();

const emit = defineEmits<{
  close: [];
}>();

const changes = computed(() => props.controller.changes.value);
const expandedPaths = ref<string[]>([]);
const changeKindLabels: Record<TurnFileChangeKind, string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
};
const changeKindColors: Record<TurnFileChangeKind, "primary" | "neutral" | "error"> = {
  added: "primary",
  modified: "neutral",
  deleted: "error",
};
const accordionItems = computed(() =>
  changes.value.map((change) => ({
    ...change,
    label: change.path,
    value: change.path,
  }))
);
const accordionUi = {
  root: "space-y-2",
  item: "overflow-hidden rounded-lg ring ring-default",
  trigger: "px-3 py-3 text-left hover:bg-accented focus-visible:outline-primary/40",
  label: "min-w-0",
  content: "border-t border-default/50",
  body: "p-0",
} as const;
function closeReview(): void {
  props.controller.dispose();
  emit("close");
}

watch(
  changes,
  (nextChanges) => {
    const nextPaths = new Set(nextChanges.map((change) => change.path));
    expandedPaths.value = expandedPaths.value.filter((path) => nextPaths.has(path));
  },
  { immediate: true }
);

onUnmounted(() => {
  props.controller.dispose();
});
</script>

<template>
  <USlideover
    :close="false"
    :ui="{
      content: 'w-[min(100vw,960px)] max-w-none',
      body: 'h-full min-h-0 p-0 sm:p-0',
    }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col bg-default" data-test="turn-file-change-review">
        <header class="shrink-0 border-b border-default px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-semibold text-highlighted">本轮文件变更</h2>
            </div>
            <UTooltip text="关闭">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="关闭本轮文件变更"
                @click="closeReview"
              />
            </UTooltip>
          </div>
        </header>

        <div v-if="changes.length > 0" class="min-h-0 flex-1 overflow-y-auto p-3">
          <UAccordion
            v-model="expandedPaths"
            :items="accordionItems"
            type="multiple"
            :unmount-on-hide="false"
            value-key="value"
            label-key="label"
            :ui="accordionUi"
            data-test="turn-file-change-accordion"
          >
            <template #default="{ item }">
              <span
                class="flex min-w-0 flex-1 items-start justify-between gap-3"
                :data-test="`turn-file-change-trigger-${item.path}`"
              >
                <span class="wrap-anywhere min-w-0 font-mono text-xs leading-5 text-default">
                  {{ item.path }}
                </span>
                <UBadge
                  :color="changeKindColors[item.kind]"
                  variant="soft"
                  size="xs"
                  class="mt-0.5 shrink-0"
                >
                  {{ changeKindLabels[item.kind] }}
                </UBadge>
              </span>
            </template>

            <template #body="{ item }">
              <TurnFileDiffPanel :change="item" />
            </template>
          </UAccordion>
        </div>

        <div
          v-else
          class="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-muted"
          data-test="turn-file-change-empty"
        >
          本轮没有净文件变更
        </div>
      </div>
    </template>
  </USlideover>
</template>
