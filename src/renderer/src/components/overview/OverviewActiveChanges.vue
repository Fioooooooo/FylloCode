<script setup lang="ts">
import { useRouter } from "vue-router";
import { timeAgo } from "@renderer/utils/time";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import type { ActiveChange, OverviewChangeStage } from "@renderer/stores/overview";

const props = defineProps<{
  changes: ActiveChange[];
}>();

const router = useRouter();

const stageConfig: Record<
  OverviewChangeStage,
  {
    label: string;
    color: "neutral";
    icon: string;
  }
> = {
  drafting: { label: "草拟", color: "neutral", icon: "i-lucide-pencil-line" },
  proposal: { label: "提案", color: "neutral", icon: "i-lucide-file-pen" },
  applying: { label: "Apply", color: "neutral", icon: "i-lucide-play" },
};

function taskLine(change: ActiveChange): string {
  if (!change.taskTitle && !change.taskRef) {
    return "自由讨论";
  }

  return [change.taskRef, change.taskTitle].filter(Boolean).join(" · ");
}

function createdLabel(change: ActiveChange): string {
  return change.createdAt ? timeAgo(new Date(change.createdAt)) : "未知时间";
}

function openChange(changeId: string): void {
  void router.push(`/proposal/${changeId}`);
}
</script>

<template>
  <section class="space-y-3" data-test="overview-active-changes">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-highlighted">进行中</h2>
      <span class="text-xs text-muted">{{ props.changes.length }} 个提案</span>
    </div>

    <AppEmptyState
      v-if="props.changes.length === 0"
      icon="i-lucide-file-pen"
      title="暂无进行中的提案"
      description="创建一个 proposal 或从任务发起讨论，开始推进工作。"
      compact
    />

    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <UiSurface
        v-for="change in props.changes"
        :key="change.id"
        as="button"
        interactive
        padding="sm"
        class="text-left"
        @click="openChange(change.id)"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0 space-y-2">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ change.title }}
            </p>
            <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-list-checks" class="size-3.5 shrink-0" />
              <span class="truncate">{{ taskLine(change) }}</span>
            </p>
          </div>
          <UBadge
            :color="stageConfig[change.stage].color"
            variant="soft"
            size="sm"
            class="shrink-0 font-normal"
          >
            <span class="inline-flex items-center gap-1">
              <UIcon :name="stageConfig[change.stage].icon" class="size-3" />
              {{ stageConfig[change.stage].label }}
            </span>
          </UBadge>
        </div>

        <div class="mt-3 text-xs text-muted">
          <span>{{ createdLabel(change) }}</span>
        </div>
      </UiSurface>
    </div>
  </section>
</template>
