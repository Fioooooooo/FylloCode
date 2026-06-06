<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSortable } from "@vueuse/integrations/useSortable";
import type { SortableEvent } from "sortablejs";
import StageCard from "./StageCard.vue";
import { useWorkflowEditor } from "@renderer/composables/useWorkflowEditor";
import { STAGE_TEMPLATES } from "@renderer/utils/workflow";
import type { WorkflowStage, WorkflowStageType } from "@shared/types/workflow";

const props = withDefaults(
  defineProps<{
    stages: WorkflowStage[];
    readonly?: boolean;
    modelValue: string;
  }>(),
  {
    readonly: false,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const listRef = ref<HTMLElement | null>(null);
const stageOrder = ref<string[]>([]);
const yamlSource = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const workflowEditor = useWorkflowEditor(yamlSource);

const stageMap = computed(
  () =>
    new Map(
      props.stages.map((stage) => {
        return [stage.id, stage] as const;
      })
    )
);

const orderedStages = computed(() =>
  stageOrder.value
    .map((stageId) => stageMap.value.get(stageId))
    .filter((stage): stage is WorkflowStage => Boolean(stage))
);

const stageTypeItems = computed(() =>
  (Object.keys(STAGE_TEMPLATES) as WorkflowStageType[]).map((type) => ({
    label: type,
    onSelect: () => workflowEditor.appendStage(type),
  }))
);

watch(
  () => props.stages.map((stage) => stage.id),
  (nextOrder) => {
    stageOrder.value = [...nextOrder];
  },
  { immediate: true }
);

function handleSortUpdate(event: SortableEvent): void {
  if (event.oldIndex == null || event.newIndex == null || event.oldIndex === event.newIndex) {
    return;
  }

  const nextOrder = [...stageOrder.value];
  const [movedStageId] = nextOrder.splice(event.oldIndex, 1);

  if (!movedStageId) {
    return;
  }

  nextOrder.splice(event.newIndex, 0, movedStageId);
  stageOrder.value = nextOrder;
  workflowEditor.reorderStages(nextOrder);
}

const sortable = useSortable(listRef, stageOrder, {
  animation: 150,
  handle: ".stage-drag-handle",
  disabled: props.readonly,
  watchElement: true,
  onUpdate: handleSortUpdate,
});

watch(
  () => props.readonly,
  (value) => {
    sortable.option("disabled", value);
  },
  { immediate: true }
);

function handleUpdateAgent(stageId: string, agentId: string): void {
  workflowEditor.updateStageAgent(stageId, agentId);
}

function handleRemoveStage(stageId: string): void {
  workflowEditor.removeStage(stageId);
}
</script>

<template>
  <div class="flex flex-col min-h-0">
    <div class="flex items-center justify-between gap-3 mb-3 shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <p class="text-xs font-medium text-muted">Workflow 阶段预览</p>
        <UBadge color="neutral" variant="soft" size="xs"> {{ stages.length }} 个阶段 </UBadge>
      </div>

      <UDropdownMenu
        v-if="!readonly"
        :items="stageTypeItems"
        :content="{ align: 'end', side: 'bottom', sideOffset: 4 }"
      >
        <UButton variant="ghost" color="neutral" size="xs" square>
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
        </UButton>
      </UDropdownMenu>
    </div>

    <div v-if="orderedStages.length === 0" class="text-sm text-muted py-8">
      YAML 中尚未定义阶段。
    </div>

    <div v-else ref="listRef" class="space-y-3">
      <div
        v-for="(stage, index) in orderedStages"
        :key="stage.id"
        class="rounded-md border border-default bg-elevated px-4 py-3"
      >
        <div class="flex items-start gap-3">
          <div class="flex shrink-0 flex-col items-center gap-2 pt-0.5">
            <UBadge variant="soft" color="neutral" size="xs">
              {{ index + 1 }}
            </UBadge>
            <button
              v-if="!readonly"
              type="button"
              class="stage-drag-handle inline-flex cursor-grab items-center justify-center text-muted transition-colors hover:text-highlighted active:cursor-grabbing"
              aria-label="拖拽排序"
            >
              <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
            </button>
          </div>

          <StageCard
            :stage="stage"
            :readonly="readonly"
            @update:agent="handleUpdateAgent(stage.id, $event)"
            @remove="handleRemoveStage(stage.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
