<script setup lang="ts">
import { computed, ref } from "vue";
import type { FylloActionRailContributorItem } from "@renderer/features/fyllo-action";

const props = defineProps<{
  items: FylloActionRailContributorItem[];
}>();

const emit = defineEmits<{
  "locate-action": [actionId: string];
}>();

const collapsed = ref(false);
const itemCount = computed(() => props.items.length);
</script>

<template>
  <div v-if="items.length > 0" class="space-y-1" data-test="fyllo-action-panel">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 px-1 py-1.5 text-muted hover:text-highlighted transition-colors"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-circle-dot-dashed" class="w-3.5 h-3.5 shrink-0" />
        <span class="text-sm font-medium uppercase tracking-wide">待处理操作</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-xs tabular-nums opacity-70">{{ itemCount }} 个</span>
        <UIcon
          :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
          class="w-3.5 h-3.5 opacity-70"
        />
      </div>
    </button>

    <div v-show="!collapsed" class="space-y-2">
      <UiSurface
        v-for="item in props.items"
        :key="item.actionId"
        as="button"
        interactive
        variant="flat"
        padding="sm"
        class="w-full border border-default text-left focus-visible:outline-2 focus-visible:outline-primary"
        data-test="fyllo-action-rail-item"
        @click="emit('locate-action', item.actionId)"
      >
        <div class="flex items-start gap-2">
          <div
            class="flex size-7 shrink-0 items-center justify-center rounded-md bg-accented text-highlighted"
          >
            <UIcon :name="item.icon" class="size-3.5" />
          </div>
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
            <p class="truncate text-xs text-muted">{{ item.summary ?? item.type }}</p>
          </div>
        </div>
      </UiSurface>
    </div>
  </div>
</template>
