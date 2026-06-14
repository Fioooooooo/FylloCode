<script setup lang="ts">
import { timeAgo } from "@renderer/utils/time";
import type { RecentLineage } from "@renderer/stores/overview";

defineProps<{
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
  merged: {
    label: "merged",
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

function lineageStart(lineage: RecentLineage): string {
  return lineage.taskRef ?? "自由讨论";
}

function shortSha(lineage: RecentLineage): string {
  return lineage.mergeCommitSha?.slice(0, 7) ?? "";
}
</script>

<template>
  <section class="space-y-3" data-test="overview-recent-lineages">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-highlighted">最近脉络</h2>
      <span class="text-xs text-muted">{{ lineages.length }} 条脉络</span>
    </div>

    <div
      v-if="lineages.length === 0"
      class="rounded-lg border border-dashed border-default bg-elevated/60 px-4 py-8 text-center"
    >
      <UIcon name="i-lucide-git-merge" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">还没有脉络记录</p>
    </div>

    <div v-else class="space-y-2.5">
      <div
        v-for="lineage in lineages"
        :key="lineage.subjectId"
        class="rounded-lg border border-default bg-elevated px-4 py-3 transition-colors hover:bg-accented"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <UBadge
                :color="originConfig[lineage.origin].color"
                variant="outline"
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

        <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span class="truncate font-mono px-1 rounded">{{ lineageStart(lineage) }}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{{ lineage.sessionCount }} sessions</span>
          <span aria-hidden="true">&middot;</span>
          <span>{{ lineage.proposalCount }} proposals</span>
          <span aria-hidden="true">&middot;</span>
          <span
            :class="[
              'inline-flex items-center gap-1 font-medium',
              statusConfig[lineage.mergeStatus].className,
            ]"
          >
            <UIcon
              :name="statusConfig[lineage.mergeStatus].icon"
              :class="['size-3', lineage.mergeStatus === 'applying' ? 'animate-spin' : '']"
            />
            <template v-if="lineage.mergeStatus === 'merged' && lineage.mergeCommitSha">
              <span class="rounded px-1.5 py-0.5 font-mono text-highlighted">
                {{ shortSha(lineage) }}
              </span>
            </template>
            <template v-else>
              {{ statusConfig[lineage.mergeStatus].label }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
