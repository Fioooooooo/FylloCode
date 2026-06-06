<script lang="ts">
export interface DropdownMenuItem {
  label?: string;
  icon?: string;
  color?: "neutral" | "primary" | "warning" | "success" | "error" | "info" | "secondary";
  onSelect?: () => void;
  type?: "separator";
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ApplyRunMeta, ProposalMeta, ProposalStatus } from "@shared/types/proposal";

const props = defineProps<{
  proposal: ProposalMeta | null;
  changeId: string;
  workflowMenuItems: DropdownMenuItem[][];
  workflowStoreLoading: boolean;
  runMeta: ApplyRunMeta | null;
  isStreaming: boolean;
  canArchive: boolean;
}>();

defineEmits<{
  back: [];
  "open-side-panel": [];
  "view-run-history": [];
  archive: [];
}>();

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
  applying: { label: "实施中", color: "primary", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

const isApplying = computed(() => props.proposal?.status === "applying" && Boolean(props.runMeta));
const canViewRunHistory = computed(
  () => props.proposal?.status === "archived" || props.proposal?.status === "applying"
);

function getStageIndex(): number {
  if (!props.runMeta || props.runMeta.stages.length === 0) {
    return 0;
  }

  return Math.min(props.runMeta.currentStageIndex, props.runMeta.stages.length - 1);
}

function getStageCount(): number {
  return props.runMeta?.stages.length ?? 0;
}
</script>

<template>
  <div class="shrink-0 border-b border-default">
    <div class="max-w-3xl mx-auto px-6 py-5 space-y-3">
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-arrow-left"
          @click="$emit('back')"
        >
          返回
        </UButton>
      </div>

      <div v-if="proposal" class="flex items-start justify-between gap-4">
        <h1 class="text-xl font-semibold text-highlighted">{{ proposal.title }}</h1>
        <div class="flex items-center gap-2 shrink-0 mt-0.5">
          <UBadge
            :color="statusConfig[proposal.status].color"
            :variant="statusConfig[proposal.status].variant"
          >
            {{ statusConfig[proposal.status].label }}
          </UBadge>
          <div :class="isStreaming ? 'pointer-events-none opacity-60' : ''">
            <UDropdownMenu
              v-if="proposal.status === 'draft'"
              :items="workflowMenuItems"
              :loading="workflowStoreLoading"
            >
              <UButton
                size="xs"
                color="primary"
                icon="i-lucide-play"
                trailing-icon="i-lucide-chevron-down"
              >
                开始实现
              </UButton>
            </UDropdownMenu>
            <UButton
              v-else-if="canArchive"
              size="xs"
              color="neutral"
              icon="i-lucide-archive"
              @click="$emit('archive')"
            >
              归档
            </UButton>
            <UButton
              v-else-if="canViewRunHistory"
              size="xs"
              color="neutral"
              icon="i-lucide-history"
              @click="$emit('view-run-history')"
            >
              查看运行历史
            </UButton>
          </div>
        </div>
      </div>

      <div v-if="proposal" class="flex items-center gap-4 text-sm text-muted">
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
          {{ proposal.date }}
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-check-square" class="w-3.5 h-3.5" />
          {{ proposal.doneTasks }}/{{ proposal.totalTasks }} tasks
        </span>
      </div>

      <div v-else class="space-y-2">
        <h1 class="text-xl font-semibold text-highlighted">{{ changeId }}</h1>
        <p class="text-sm text-muted">未找到该 proposal 的元数据</p>
      </div>
    </div>

    <button
      v-if="isApplying && runMeta"
      class="w-full border-t border-warning/20 bg-warning/8 hover:bg-warning/12 transition-colors cursor-pointer"
      @click="$emit('open-side-panel')"
    >
      <div class="max-w-3xl mx-auto px-6 py-2 flex items-center gap-2 text-sm">
        <span class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
        <span class="text-warning font-medium">{{ runMeta.workflowId }}</span>
        <span class="text-muted mx-1">·</span>
        <span class="text-muted">
          阶段 {{ getStageCount() > 0 ? getStageIndex() + 1 : 0 }}/{{ getStageCount() }}：{{
            runMeta.stages[getStageIndex()]?.name ?? "准备中"
          }}
        </span>
        <UIcon name="i-lucide-panel-right-open" class="w-3.5 h-3.5 text-muted ml-auto" />
      </div>
    </button>
  </div>
</template>
