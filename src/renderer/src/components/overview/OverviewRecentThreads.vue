<script setup lang="ts">
import { timeAgo } from "@renderer/utils/time";
import type { RecentThread } from "@renderer/stores/overview";

defineProps<{
  threads: RecentThread[];
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

function threadTitle(thread: RecentThread): string {
  return thread.taskTitle ?? "自由讨论";
}

function threadStart(thread: RecentThread): string {
  return thread.taskRef ?? "自由讨论";
}

function shortSha(thread: RecentThread): string {
  return thread.mergeCommitSha?.slice(0, 7) ?? "";
}
</script>

<template>
  <section class="space-y-3" data-test="overview-recent-threads">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-highlighted">最近线索</h2>
      <span class="text-xs text-muted">{{ threads.length }} 条</span>
    </div>

    <div
      v-if="threads.length === 0"
      class="rounded-lg border border-dashed border-default bg-elevated/60 px-4 py-8 text-center"
    >
      <UIcon name="i-lucide-git-merge" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">还没有线索记录</p>
    </div>

    <div v-else class="space-y-2.5">
      <div
        v-for="thread in threads"
        :key="thread.subjectId"
        class="rounded-lg border border-default bg-elevated px-4 py-3 transition-colors hover:bg-accented"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <UBadge
                :color="originConfig[thread.origin].color"
                variant="outline"
                size="sm"
                class="shrink-0 font-normal"
              >
                <span class="inline-flex items-center gap-1">
                  <UIcon :name="originConfig[thread.origin].icon" class="size-3" />
                  {{ originConfig[thread.origin].label }}
                </span>
              </UBadge>
              <p class="truncate text-sm font-medium text-highlighted">
                {{ threadTitle(thread) }}
              </p>
            </div>
          </div>

          <span class="shrink-0 text-xs text-muted">
            {{ timeAgo(new Date(thread.updatedAt)) }}
          </span>
        </div>

        <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span class="truncate font-mono bg-muted/40 px-1 rounded">{{ threadStart(thread) }}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{{ thread.sessionCount }} sessions</span>
          <span aria-hidden="true">&middot;</span>
          <span>{{ thread.proposalCount }} proposals</span>
          <span aria-hidden="true">&middot;</span>
          <span
            :class="[
              'inline-flex items-center gap-1 font-medium',
              statusConfig[thread.mergeStatus].className,
            ]"
          >
            <UIcon
              :name="statusConfig[thread.mergeStatus].icon"
              :class="['size-3', thread.mergeStatus === 'applying' ? 'animate-spin' : '']"
            />
            <template v-if="thread.mergeStatus === 'merged' && thread.mergeCommitUrl">
              <a
                :href="thread.mergeCommitUrl"
                target="_blank"
                rel="noreferrer"
                class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-highlighted hover:bg-muted/80"
              >
                {{ shortSha(thread) }}
              </a>
            </template>
            <template v-else>
              {{ statusConfig[thread.mergeStatus].label }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
