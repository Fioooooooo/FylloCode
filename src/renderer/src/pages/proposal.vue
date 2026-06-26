<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import { useProposalStore } from "@renderer/stores/proposal";
import type { ProposalStatus } from "@shared/types/proposal";

type ProposalFilter = ProposalStatus | "all";

const store = useProposalStore();
const { openProposalDetail } = useProposalDetailSlideover();
const selectedFilter = ref<ProposalFilter>("all");

const filterTabs: { label: string; value: ProposalFilter }[] = [
  { label: "全部", value: "all" },
  { label: "创建中", value: "creating" },
  { label: "草稿", value: "draft" },
  { label: "实现中", value: "applying" },
  { label: "已归档", value: "archived" },
];

const statusConfig: Record<
  ProposalStatus,
  {
    label: string;
    color: "neutral" | "primary" | "warning" | "success" | "error" | "info" | "secondary";
    variant: "soft" | "outline" | "subtle";
  }
> = {
  creating: { label: "创建中", color: "primary", variant: "soft" },
  draft: { label: "草稿", color: "neutral", variant: "soft" },
  applying: { label: "实现中", color: "warning", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

const stats = computed(() => [
  { key: "total", label: "全部", value: store.proposals.length },
  {
    key: "applying",
    label: "进行中",
    value: store.proposals.filter((proposal) => proposal.status === "applying").length,
  },
  {
    key: "archived",
    label: "已归档",
    value: store.proposals.filter((proposal) => proposal.status === "archived").length,
  },
]);

const filteredProposals = computed(() => {
  if (selectedFilter.value === "all") {
    return store.proposals;
  }

  return store.proposals.filter((proposal) => proposal.status === selectedFilter.value);
});

function openDetail(id: string): void {
  void openProposalDetail(id);
}

onMounted(() => {
  void store.loadProposals();
});
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-default">
    <div class="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div class="space-y-1">
        <span class="text-[11px] font-medium uppercase tracking-wider text-muted">Proposals</span>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">变更提案</h1>
        <p class="text-sm text-muted">管理 OpenSpec 变更提案，追踪实现进度。</p>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <UiSurface v-for="stat in stats" :key="stat.key" padding="sm">
          <p class="text-xs text-muted">{{ stat.label }}</p>
          <p class="text-2xl font-semibold text-highlighted">{{ stat.value }}</p>
        </UiSurface>
      </div>

      <UTabs
        v-model="selectedFilter"
        :items="filterTabs"
        size="sm"
        variant="pill"
        value-key="value"
      />

      <div v-if="store.loading" class="rounded-lg bg-elevated px-4 py-8">
        <div class="flex items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          正在加载 proposals
        </div>
      </div>

      <div v-else-if="store.error" class="rounded-lg border border-error/30 bg-error/5 px-4 py-4">
        <div class="flex items-start gap-2 text-sm text-error">
          <UIcon name="i-lucide-circle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
          <span>{{ store.error }}</span>
        </div>
      </div>

      <AppEmptyState
        v-else-if="filteredProposals.length === 0"
        icon="i-lucide-file-question"
        title="暂无匹配的 proposal"
        description="当前筛选条件下没有 proposal，尝试切换筛选条件或创建新提案。"
      />

      <div v-else class="space-y-3">
        <UiSurface
          v-for="proposal in filteredProposals"
          :key="proposal.id"
          as="button"
          interactive
          padding="sm"
          class="text-left w-full"
          @click="openDetail(proposal.id)"
        >
          <div class="space-y-2.5">
            <div class="flex items-start justify-between gap-3">
              <span class="text-sm font-medium text-highlighted">{{ proposal.title }}</span>
              <div class="flex items-center gap-2 shrink-0">
                <UBadge
                  :color="statusConfig[proposal.status].color"
                  :variant="statusConfig[proposal.status].variant"
                  size="sm"
                  class="shrink-0 mt-0.5"
                >
                  {{ statusConfig[proposal.status].label }}
                </UBadge>
                <span
                  v-if="proposal.worktreePath"
                  class="inline-flex items-center gap-1 text-xs text-muted shrink-0 mt-0.5"
                  :title="proposal.worktreePath"
                >
                  <UIcon name="i-lucide-git-branch" class="w-3 h-3" />
                  <span>worktree</span>
                </span>
              </div>
            </div>
            <p class="text-xs text-muted line-clamp-2 leading-relaxed">{{ proposal.why }}</p>
            <div class="flex items-center gap-3 text-xs text-muted pt-0.5">
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-calendar" class="w-3 h-3" />
                {{ proposal.date }}
              </span>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-check-square" class="w-3 h-3" />
                {{ proposal.doneTasks }}/{{ proposal.totalTasks }} tasks
              </span>
            </div>
          </div>
        </UiSurface>
      </div>
    </div>
  </div>
</template>
