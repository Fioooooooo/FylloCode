<script setup lang="ts">
import { computed } from "vue";
import {
  getProposalDisplayStatus,
  proposalDisplayStatusConfig,
} from "@renderer/utils/proposal-display-status";
import type { ProposalMeta } from "@shared/types/proposal";

const props = defineProps<{
  proposal: ProposalMeta | null;
  changeId: string;
  refreshingMeta: boolean;
}>();

defineEmits<{
  close: [];
}>();

const displayStatus = computed(() => getProposalDisplayStatus(props.proposal));
</script>

<template>
  <div class="shrink-0 bg-muted border-b border-default/50">
    <div class="max-w-3xl mx-auto px-6 py-5 space-y-3">
      <div v-if="proposal" class="flex items-start justify-between gap-4">
        <h1 class="text-xl font-semibold text-highlighted">{{ proposal.title }}</h1>
        <div class="flex items-center gap-2 shrink-0 mt-0.5">
          <UBadge
            v-if="displayStatus"
            :color="proposalDisplayStatusConfig[displayStatus].color"
            :variant="proposalDisplayStatusConfig[displayStatus].variant"
          >
            {{ proposalDisplayStatusConfig[displayStatus].label }}
          </UBadge>
          <UTooltip text="关闭详情">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              aria-label="关闭 proposal 详情"
              @click="$emit('close')"
            />
          </UTooltip>
        </div>
      </div>

      <div v-if="proposal" class="flex items-center gap-4 text-sm text-muted">
        <span class="flex min-w-0 items-center gap-1.5" data-test="proposal-detail-owner">
          <UIcon name="i-lucide-folder-git-2" class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">Project：{{ proposal.folderName }}</span>
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
          {{ proposal.date }}
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-check-square" class="w-3.5 h-3.5" />
          {{ proposal.doneTasks }}/{{ proposal.totalTasks }} tasks
        </span>
        <UTooltip v-if="refreshingMeta" text="正在刷新 proposal 元数据">
          <span
            class="inline-flex items-center"
            aria-label="正在刷新 proposal 元数据"
            data-test="proposal-meta-refreshing"
          >
            <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
          </span>
        </UTooltip>
      </div>

      <div v-else class="space-y-2">
        <div class="flex items-start justify-between gap-4">
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="text-xl font-semibold text-highlighted">{{ changeId }}</h1>
            <UTooltip v-if="refreshingMeta" text="正在刷新 proposal 元数据">
              <span
                class="inline-flex items-center text-muted"
                aria-label="正在刷新 proposal 元数据"
                data-test="proposal-meta-refreshing"
              >
                <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
              </span>
            </UTooltip>
          </div>
          <UTooltip text="关闭详情">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              aria-label="关闭 proposal 详情"
              @click="$emit('close')"
            />
          </UTooltip>
        </div>
        <p class="text-sm text-muted">未找到该 proposal 的元数据</p>
      </div>
    </div>
  </div>
</template>
