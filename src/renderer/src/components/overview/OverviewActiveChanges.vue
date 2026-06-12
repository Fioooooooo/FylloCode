<script setup lang="ts">
import { useRouter } from "vue-router";
import { timeAgo } from "@renderer/utils/time";
import type { ActiveChange, OverviewChangeStage } from "@renderer/stores/overview";

defineProps<{
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

function openChange(changeName: string): void {
  void router.push(`/proposal/${changeName}`);
}
</script>

<template>
  <section class="space-y-3" data-test="overview-active-changes">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-highlighted">进行中</h2>
      <span class="text-xs text-muted">{{ changes.length }} 个提案</span>
    </div>

    <div
      v-if="changes.length === 0"
      class="rounded-lg border border-dashed border-default bg-elevated/60 px-4 py-8 text-center"
    >
      <UIcon name="i-lucide-file-pen" class="mx-auto size-6 text-muted" />
      <p class="mt-3 text-sm text-muted">暂无进行中的提案</p>
    </div>

    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <button
        v-for="change in changes"
        :key="change.changeName"
        type="button"
        class="group rounded-lg border border-default bg-elevated px-4 py-3 text-left transition-colors hover:bg-accented"
        @click="openChange(change.changeName)"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0 space-y-2">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ change.changeName }}
            </p>
            <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-list-checks" class="size-3.5 shrink-0" />
              <span class="truncate">{{ taskLine(change) }}</span>
            </p>
          </div>
          <UBadge
            :color="stageConfig[change.stage].color"
            variant="outline"
            size="sm"
            class="shrink-0 font-normal"
          >
            <span class="inline-flex items-center gap-1">
              <UIcon :name="stageConfig[change.stage].icon" class="size-3" />
              {{ stageConfig[change.stage].label }}
            </span>
          </UBadge>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
          <span>{{ createdLabel(change) }}</span>
          <span
            class="inline-flex items-center gap-1 opacity-0 transition-all duration-150 group-hover:opacity-75"
          >
            查看
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </button>
    </div>
  </section>
</template>
