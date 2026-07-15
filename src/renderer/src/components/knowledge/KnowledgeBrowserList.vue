<script setup lang="ts">
import { computed } from "vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { sortKnowledgeEntries } from "@renderer/utils/knowledge-browser";
import type {
  KnowledgeBrowserEntry,
  KnowledgeBrowserError,
  KnowledgeEntryType,
} from "@shared/types/knowledge";

const props = defineProps<{
  entries: KnowledgeBrowserEntry[];
  errors: KnowledgeBrowserError[];
  selectedName: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [name: string];
}>();

const groups: Array<{ type: KnowledgeEntryType; label: string }> = [
  { type: "project", label: "项目知识" },
  { type: "reference", label: "参考资料" },
  { type: "feedback", label: "用户反馈" },
];

const groupedEntries = computed(() =>
  groups.map((group) => ({
    ...group,
    entries: sortKnowledgeEntries(props.entries.filter((entry) => entry.type === group.type)),
  }))
);

const statusColor: Record<KnowledgeBrowserEntry["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  suspect: "warning",
  unknown: "neutral",
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
</script>

<template>
  <div class="space-y-5" data-test="knowledge-browser-list">
    <div v-if="loading" class="space-y-2" data-test="knowledge-list-loading">
      <div v-for="item in 7" :key="item" class="rounded-lg bg-elevated/70 px-2.5 py-2">
        <USkeleton class="h-4 w-36 rounded" />
        <USkeleton class="mt-2 h-3 w-full rounded" />
      </div>
    </div>

    <template v-else>
      <section
        v-for="group in groupedEntries"
        v-show="group.entries.length > 0"
        :key="group.type"
        class="space-y-1"
        :data-test="`knowledge-group-${group.type}`"
      >
        <div class="flex items-center justify-between gap-2 px-2 pb-1">
          <h2 class="text-[11px] font-medium text-muted">{{ group.label }}</h2>
          <span class="text-[11px] text-muted">{{ group.entries.length }}</span>
        </div>

        <UiSurface
          v-for="entry in group.entries"
          :key="entry.name"
          as="button"
          variant="flat"
          interactive
          padding="none"
          class="w-full px-2.5 py-2 text-left"
          :class="
            selectedName === entry.name
              ? '!bg-primary/15 text-primary ring-1 ring-primary/15'
              : 'text-default hover:bg-elevated'
          "
          data-test="knowledge-list-item"
          :data-name="entry.name"
          @click="emit('select', entry.name)"
        >
          <div class="min-w-0 space-y-1">
            <div class="flex min-w-0 items-center justify-between gap-2">
              <p class="truncate text-sm font-medium text-highlighted">{{ entry.name }}</p>
              <UBadge :color="statusColor[entry.status]" variant="soft" size="xs">
                {{ entry.status }}
              </UBadge>
            </div>
            <p class="line-clamp-2 text-xs leading-relaxed text-muted">
              {{ entry.description || "未提供描述" }}
            </p>
            <p class="text-[11px] text-muted">{{ formatUpdatedAt(entry.updatedAt) }}</p>
          </div>
        </UiSurface>
      </section>

      <section v-if="errors.length > 0" class="space-y-1" data-test="knowledge-error-group">
        <div class="flex items-center justify-between gap-2 px-2 pb-1">
          <h2 class="text-[11px] font-medium text-warning">无法索引</h2>
          <span class="text-[11px] text-muted">{{ errors.length }}</span>
        </div>

        <template v-for="item in errors" :key="item.path">
          <UiSurface
            v-if="item.name"
            as="button"
            variant="flat"
            interactive
            padding="none"
            class="w-full px-2.5 py-2 text-left"
            :class="
              selectedName === item.name
                ? '!bg-warning/10 ring-1 ring-warning/20'
                : 'hover:bg-elevated'
            "
            data-test="knowledge-error-item"
            :data-name="item.name"
            @click="emit('select', item.name)"
          >
            <div class="min-w-0 space-y-1">
              <p class="truncate font-mono text-xs font-medium text-highlighted">{{ item.path }}</p>
              <p class="line-clamp-2 text-xs text-warning">{{ item.message }}</p>
            </div>
          </UiSurface>

          <div
            v-else
            class="rounded-lg bg-warning/5 px-2.5 py-2"
            data-test="knowledge-error-item-disabled"
          >
            <p class="truncate font-mono text-xs font-medium text-highlighted">{{ item.path }}</p>
            <p class="mt-1 line-clamp-2 text-xs text-warning">{{ item.message }}</p>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
