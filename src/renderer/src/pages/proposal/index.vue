<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProposalStore } from "@renderer/stores/proposal";
import type { ProposalStatus } from "@shared/types/proposal";

type ProposalFilter = ProposalStatus | "all";

const router = useRouter();
const store = useProposalStore();
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

const stats = computed(() => ({
  total: store.proposals.length,
  applying: store.proposals.filter((proposal) => proposal.status === "applying").length,
  archived: store.proposals.filter((proposal) => proposal.status === "archived").length,
}));

const filteredProposals = computed(() => {
  if (selectedFilter.value === "all") {
    return store.proposals;
  }

  return store.proposals.filter((proposal) => proposal.status === selectedFilter.value);
});

function openDetail(id: string): void {
  void router.push(`/proposal/${id}`);
}

onMounted(() => {
  void store.loadProposals();
});
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-default">
    <div class="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold text-highlighted">Proposals</h1>
        <p class="text-sm text-muted">管理 OpenSpec 变更提案，追踪实现进度。</p>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div class="rounded-lg border border-default bg-elevated px-4 py-3 space-y-1">
          <p class="text-xs text-muted">全部</p>
          <p class="text-2xl font-semibold text-highlighted">{{ stats.total }}</p>
        </div>
        <div class="rounded-lg border border-default bg-elevated px-4 py-3 space-y-1">
          <p class="text-xs text-muted">进行中</p>
          <p class="text-2xl font-semibold text-highlighted">{{ stats.applying }}</p>
        </div>
        <div class="rounded-lg border border-default bg-elevated px-4 py-3 space-y-1">
          <p class="text-xs text-muted">已归档</p>
          <p class="text-2xl font-semibold text-highlighted">{{ stats.archived }}</p>
        </div>
      </div>

      <UTabs
        v-model="selectedFilter"
        :items="filterTabs"
        size="sm"
        variant="link"
        value-key="value"
      />

      <div v-if="store.loading" class="rounded-lg border border-default bg-elevated px-4 py-8">
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

      <div
        v-else-if="filteredProposals.length === 0"
        class="rounded-lg border border-default bg-elevated px-4 py-8 text-center text-sm text-muted"
      >
        暂无匹配的 proposal
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="proposal in filteredProposals"
          :key="proposal.id"
          class="rounded-lg border border-default bg-elevated px-4 py-4 cursor-pointer hover:bg-accented transition-colors"
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
        </div>
      </div>
    </div>
  </div>
</template>
