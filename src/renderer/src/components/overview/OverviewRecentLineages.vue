<script setup lang="ts">
import { timeAgo } from "@renderer/utils/time";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import type { RecentLineage } from "@renderer/stores/overview";

const props = defineProps<{
  lineages: RecentLineage[];
}>();

const originConfig = {
  task: {
    label: "任务",
    color: "neutral",
    icon: "i-lucide-list-checks",
  },
  chat: {
    label: "对话",
    color: "neutral",
    icon: "i-lucide-message-circle",
  },
} as const;

const statusConfig = {
  completed: {
    label: "completed",
    icon: "i-lucide-check",
    className: "text-success",
  },
  applying: {
    label: "applying",
    icon: "i-lucide-loader-2",
    className: "text-info",
  },
  pending: {
    label: "pending",
    icon: "i-lucide-clock-3",
    className: "text-muted",
  },
} as const;

function lineageTitle(lineage: RecentLineage): string {
  return lineage.taskTitle ?? "自由讨论";
}

function shortSha(lineage: RecentLineage): string {
  return lineage.archiveCommitHash?.slice(0, 7) ?? "";
}
</script>

<template>
  <section class="space-y-3" data-test="overview-recent-lineages">
    <div class="flex items-center justify-between gap-3">
      <h2
        class="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 dark:text-primary-400"
      >
        <span class="size-1.5 rounded-full bg-primary-600 dark:bg-primary-400" />
        最近脉络
      </h2>
      <span class="text-xs text-muted">{{ props.lineages.length }} 条脉络</span>
    </div>

    <AppEmptyState
      v-if="props.lineages.length === 0"
      icon="i-lucide-git-merge"
      title="还没有脉络记录"
      description="从任务或聊天开始一次讨论，脉络会自动建立。"
      compact
    />

    <div v-else class="relative isolate space-y-0.5" data-test="overview-lineage-timeline">
      <div
        class="absolute bottom-5 left-[9px] top-5 w-px bg-gradient-to-b from-primary-600 via-primary-500 to-primary-200 dark:from-primary-400 dark:via-primary-500 dark:to-primary-800"
        aria-hidden="true"
      />
      <div
        v-for="lineage in props.lineages"
        :key="lineage.subjectId"
        class="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3"
      >
        <div class="flex items-start justify-center pt-4" aria-hidden="true">
          <div
            class="z-10 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-default ring-2 ring-primary/40"
            data-test="overview-lineage-timeline-node"
          >
            <span class="size-1.5 rounded-full bg-primary" />
          </div>
        </div>

        <UiSurface variant="flat" padding="sm" class="mb-2.5 border border-default !bg-default">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2">
                <UBadge
                  :color="originConfig[lineage.origin].color"
                  variant="soft"
                  size="sm"
                  class="shrink-0 font-normal"
                >
                  <span class="inline-flex items-center gap-1">
                    <UIcon :name="originConfig[lineage.origin].icon" class="size-3" />
                    {{ originConfig[lineage.origin].label }}
                  </span>
                </UBadge>
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ lineageTitle(lineage) }}
                </p>
              </div>
            </div>

            <span class="shrink-0 text-xs text-muted">
              {{ timeAgo(new Date(lineage.updatedAt)) }}
            </span>
          </div>

          <div
            class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"
            data-test="overview-lineage-meta"
          >
            <span>{{ lineage.sessionCount }} sessions</span>
            <span aria-hidden="true">&middot;</span>
            <span>{{ lineage.proposalCount }} proposals</span>
            <span aria-hidden="true">&middot;</span>
            <span
              :class="[
                'inline-flex items-center gap-1 font-medium',
                statusConfig[lineage.proposalStatus].className,
              ]"
            >
              <UIcon
                :name="statusConfig[lineage.proposalStatus].icon"
                :class="['size-3', lineage.proposalStatus === 'applying' ? 'animate-spin' : '']"
              />
              <template v-if="lineage.proposalStatus === 'completed' && lineage.archiveCommitHash">
                <span class="rounded px-1.5 py-0.5 font-mono text-highlighted">
                  {{ shortSha(lineage) }}
                </span>
              </template>
              <template v-else>
                {{ statusConfig[lineage.proposalStatus].label }}
              </template>
            </span>
          </div>
        </UiSurface>
      </div>
    </div>
  </section>
</template>
