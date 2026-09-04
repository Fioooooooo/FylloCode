<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowProposalDetail, WorkflowProposalPersist } from "@shared/types/workflow";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import { semanticIcons } from "@renderer/config/semantic-icons";
import {
  isProposalActionableStage,
  projectWorkflowProposalDetail,
  workflowProposalStatusPresentation,
} from "../model/projection";

const props = defineProps<{
  detail: WorkflowProposalDetail | null;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  confirm: [persist: WorkflowProposalPersist];
  cancel: [];
}>();

const projection = computed(() =>
  props.detail ? projectWorkflowProposalDetail(props.detail) : null
);
const presentation = computed(() =>
  props.detail ? workflowProposalStatusPresentation(props.detail.status) : null
);
const canDecide = computed(() => props.detail?.status === "pending" && !props.loading);
const timelineItems = computed(
  () =>
    projection.value?.stages.map(({ stage }, index) => ({
      title: `${index + 1}. ${stage.name || stage.id}`,
      description: `${stage.kind} · ${stage.id}`,
      icon: stage.terminal ? "i-lucide-circle-check" : "i-lucide-circle",
    })) ?? []
);

function formatStage(stage: WorkflowProposalDetail["definition"]["stages"][number]): string {
  return JSON.stringify(stage, null, 2);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-default" data-test="workflow-proposal-confirm-card">
    <header class="shrink-0 border-b border-default px-5 py-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="truncate text-base font-semibold text-highlighted">
              {{ projection?.name || "Workflow 提案" }}
            </h2>
            <UBadge v-if="presentation" :color="presentation.color" variant="soft" size="xs">
              <UIcon
                :name="presentation.icon"
                class="mr-1 size-3.5"
                :class="{ 'animate-spin': props.detail?.status === 'confirming' }"
              />
              {{ presentation.label }}
            </UBadge>
            <UBadge v-if="projection" color="neutral" variant="outline" size="xs">
              {{ projection.mode === "update" ? "更新" : "新建" }} proposal
            </UBadge>
          </div>
          <p v-if="projection?.mode === 'update'" class="text-xs text-muted">
            目标 workflow：{{ projection.targetWorkflowName || "未命名" }} ·
            <span class="font-mono">{{ projection.targetWorkflowId }}</span>
          </p>
        </div>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <div
        v-if="props.loading && !props.detail"
        class="flex items-center gap-2 py-8 text-sm text-muted"
        role="status"
      >
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        正在加载 Workflow 提案…
      </div>
      <AppEmptyState
        v-else-if="props.error && !props.detail"
        compact
        icon="i-lucide-circle-alert"
        title="无法加载 Workflow 提案"
        :description="props.error"
      />
      <div v-else-if="projection" class="space-y-6">
        <div
          v-if="props.error"
          class="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
          role="alert"
        >
          {{ props.error }}
        </div>

        <section aria-labelledby="workflow-proposal-timeline-title" class="space-y-3">
          <h3 id="workflow-proposal-timeline-title" class="text-sm font-semibold text-highlighted">
            Stage 拓扑
          </h3>
          <UTimeline
            orientation="vertical"
            :items="timelineItems"
            data-test="workflow-proposal-timeline"
          />
          <div class="space-y-3">
            <article
              v-for="(stageEntry, index) in projection.stages"
              :key="stageEntry.stage.id"
              class="rounded-lg border p-3"
              :class="
                stageEntry.actionableWithoutConfirmation
                  ? 'border-warning/60 bg-warning/5'
                  : 'border-default bg-elevated'
              "
              :data-test="`workflow-proposal-stage-${index}`"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-highlighted">
                  {{ index + 1 }}. {{ stageEntry.stage.name || stageEntry.stage.id }}
                </h4>
                <UBadge
                  v-if="isProposalActionableStage(stageEntry.stage)"
                  color="warning"
                  variant="solid"
                  size="xs"
                  data-test="workflow-proposal-auto-execute-badge"
                >
                  自动执行，不再确认
                </UBadge>
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ stageEntry.stage.kind }} · {{ stageEntry.stage.id }}
              </p>
              <pre
                class="mt-3 whitespace-pre-wrap wrap-anywhere rounded-md bg-default p-3 text-xs leading-5 text-default"
                >{{ formatStage(stageEntry.stage) }}</pre>
            </article>
          </div>
        </section>

        <section aria-labelledby="workflow-proposal-yaml-title" class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 id="workflow-proposal-yaml-title" class="text-sm font-semibold text-highlighted">
              完整 YAML
            </h3>
            <span class="text-xs text-muted">全部字段原文</span>
          </div>
          <pre
            class="whitespace-pre-wrap wrap-anywhere rounded-lg bg-elevated p-3 text-xs leading-5 text-default"
            data-test="workflow-proposal-full-yaml"
            >{{ projection.yaml }}</pre>
        </section>

        <p
          v-if="props.detail?.status === 'confirmed' && props.detail.handoffDelivered === false"
          class="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
          data-test="workflow-proposal-handoff-fallback"
        >
          Workflow 已保存，但当前会话当时正忙，未能自动提示 Agent；你可以直接告诉 Agent 调用
          <code>trigger_workflow</code>。
        </p>
      </div>
      <AppEmptyState
        v-else
        compact
        :icon="semanticIcons.workflow"
        title="提案信息不可用"
        description="该 Workflow 提案不存在或暂时无法读取。"
      />
    </div>

    <footer
      class="shrink-0 border-t border-default bg-default px-5 py-3"
      data-test="workflow-proposal-actions"
    >
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!canDecide"
          :loading="props.loading"
          data-test="workflow-proposal-cancel"
          @click="emit('cancel')"
        >
          取消
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          :disabled="!canDecide"
          :loading="props.loading"
          data-test="workflow-proposal-confirm-session"
          @click="emit('confirm', 'session')"
        >
          仅本次执行
        </UButton>
        <UButton
          color="primary"
          size="sm"
          :disabled="!canDecide"
          :loading="props.loading"
          data-test="workflow-proposal-confirm-workspace"
          @click="emit('confirm', 'workspace')"
        >
          保存为可复用并执行
        </UButton>
      </div>
    </footer>
  </div>
</template>
