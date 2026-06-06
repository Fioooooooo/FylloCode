<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import type { WorkflowStage, WorkflowStageType } from "@shared/types/workflow";

type StageBadgeColor = "primary" | "info" | "success" | "warning" | "neutral";

const props = withDefaults(
  defineProps<{
    stage: WorkflowStage;
    readonly?: boolean;
  }>(),
  {
    readonly: false,
  }
);

const emit = defineEmits<{
  "update:agent": [value: string];
  remove: [];
}>();

const acpAgentsStore = useAcpAgentsStore();
const { installedAgentIds } = storeToRefs(acpAgentsStore);

const stageColorMap: Record<WorkflowStageType, StageBadgeColor> = {
  "proposal-apply": "primary",
  "proposal-archive": "neutral",
  "code-review": "info",
  "security-check": "warning",
  "create-pr": "success",
  custom: "neutral",
};

const stageColor = computed(() => stageColorMap[props.stage.type]);
const agentLabel = computed(() =>
  props.stage.agent ? acpAgentsStore.getAgentLabel(props.stage.agent) : undefined
);

const agentItems = computed(() => {
  if (installedAgentIds.value.length === 0) {
    return [{ label: "暂无已安装的 Agent", disabled: true }];
  }

  return installedAgentIds.value.map((agentId) => ({
    label: acpAgentsStore.getAgentLabel(agentId),
    onSelect: () => emit("update:agent", agentId),
  }));
});
</script>

<template>
  <div class="min-w-0 flex-1">
    <div class="flex items-start justify-between gap-3 min-w-0">
      <div class="flex items-center gap-2 min-w-0">
        <h2 class="text-sm font-medium text-highlighted truncate">
          {{ stage.name }}
        </h2>
        <UBadge :color="stageColor" size="xs">
          {{ stage.type }}
        </UBadge>
      </div>

      <UButton
        v-if="!readonly"
        icon="i-lucide-trash-2"
        variant="ghost"
        size="xs"
        color="neutral"
        class="shrink-0 text-muted hover:text-error"
        aria-label="删除阶段"
        @click="emit('remove')"
      />
    </div>

    <div class="grid grid-cols-2 gap-x-5 gap-y-2 mt-3 text-xs">
      <div>
        <p class="text-muted">id</p>
        <p class="text-highlighted font-mono mt-0.5 truncate">
          {{ stage.id }}
        </p>
      </div>

      <div>
        <p class="text-muted">agent</p>
        <UDropdownMenu
          v-if="!readonly"
          :items="agentItems"
          :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
        >
          <button
            type="button"
            class="mt-0.5 flex w-full items-center justify-between gap-2 rounded-md border border-default bg-default px-2 py-1 text-left transition-colors hover:bg-muted/50"
          >
            <span class="min-w-0 truncate font-mono">
              {{ agentLabel ?? "未配置" }}
            </span>
            <UIcon name="i-lucide-chevron-down" class="w-3.5 h-3.5 shrink-0 text-muted" />
          </button>
        </UDropdownMenu>
        <p v-else class="text-highlighted font-mono mt-0.5 truncate">
          {{ agentLabel ?? "未配置" }}
        </p>
      </div>

      <div>
        <p class="text-muted">when</p>
        <p class="text-highlighted font-mono mt-0.5 truncate">
          {{ stage.when ?? "始终执行" }}
        </p>
      </div>

      <div>
        <p class="text-muted">onFailure</p>
        <p class="text-highlighted font-mono mt-0.5 truncate">
          {{ stage.onFailure ?? "停止后续阶段" }}
        </p>
      </div>
    </div>

    <div class="mt-3">
      <p class="text-xs text-muted">prompt</p>
      <p class="text-xs text-highlighted mt-1 leading-5">
        {{ stage.prompt || "未配置" }}
      </p>
    </div>

    <div class="flex flex-wrap gap-2 mt-3">
      <UBadge
        v-for="item in stage.mcp ?? []"
        :key="`mcp-${stage.id}-${item}`"
        color="neutral"
        variant="soft"
        size="xs"
      >
        MCP：{{ item }}
      </UBadge>
      <UBadge
        v-for="item in stage.skills ?? []"
        :key="`skill-${stage.id}-${item}`"
        color="primary"
        variant="soft"
        size="xs"
      >
        Skill：{{ item }}
      </UBadge>
    </div>
  </div>
</template>
