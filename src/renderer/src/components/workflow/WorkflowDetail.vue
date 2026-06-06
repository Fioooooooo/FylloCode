<script setup lang="ts">
import { computed } from "vue";
import { load } from "js-yaml";
import { useToast } from "@nuxt/ui/composables";
import StageList from "./StageList.vue";
import YamlEditor from "./YamlEditor.vue";
import { parseWorkflowYaml } from "@renderer/utils/workflow";
import type { WorkflowTemplate } from "@shared/types/workflow";

const props = defineProps<{
  modelValue: string;
  template: WorkflowTemplate | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [payload: { name: string; yaml: string }];
  delete: [];
}>();

const toast = useToast();

const isBuiltIn = computed(() => props.template?.source === "built-in");
const yamlLineCount = computed(() => props.modelValue.split("\n").length);
const parsedWorkflow = computed(() => parseWorkflowYaml(props.modelValue, props.template?.name));
const parseError = computed(() => {
  try {
    load(props.modelValue);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
});

function updateYaml(value: string): void {
  emit("update:modelValue", value);
}

function handleSave(): void {
  try {
    load(props.modelValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.add({
      title: "YAML 格式错误",
      description: message,
      color: "error",
    });
    return;
  }

  emit("save", {
    name: parsedWorkflow.value.name,
    yaml: props.modelValue,
  });
}
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <div
      v-if="isBuiltIn"
      class="flex items-center gap-2 px-6 py-2 bg-info/10 border-b border-info/20 text-xs text-info shrink-0"
    >
      <UIcon name="i-lucide-info" class="w-3.5 h-3.5 shrink-0" />
      <span>内置模板不可直接编辑，保存时将创建自定义副本</span>
    </div>

    <div class="flex items-start justify-between gap-6 px-6 py-4 border-b border-default shrink-0">
      <div class="header-left min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0">
          <h1 class="text-lg font-semibold text-highlighted truncate">
            {{ parsedWorkflow.name }}
          </h1>
          <p class="text-sm text-muted truncate">
            {{ parsedWorkflow.description }}
          </p>
        </div>

        <div class="mt-2 flex items-center gap-2">
          <UBadge color="neutral" variant="soft">v{{ parsedWorkflow.version }}</UBadge>
          <UBadge v-if="isBuiltIn" color="neutral" variant="soft">内置</UBadge>
          <UBadge v-else color="primary" variant="soft">自定义</UBadge>
        </div>
      </div>

      <div class="header-right self-center flex items-center gap-2 shrink-0">
        <UButton
          v-if="!isBuiltIn"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          class="text-muted transition-colors hover:bg-error/10 hover:text-error"
          @click="emit('delete')"
        >
          删除
        </UButton>
        <UButton
          color="primary"
          size="sm"
          :loading="saving"
          :label="isBuiltIn ? '复制并保存' : '保存 YAML'"
          @click="handleSave"
        />
      </div>
    </div>

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <section class="flex-1 min-w-0 overflow-y-auto px-6 py-4">
        <div v-if="parseError" class="text-sm text-error py-8">
          {{ parseError }}
        </div>
        <StageList
          v-else
          :model-value="modelValue"
          :stages="parsedWorkflow.stages"
          :readonly="isBuiltIn"
          @update:model-value="updateYaml"
        />
      </section>

      <section class="w-1/2 border-l border-default flex flex-col bg-default">
        <div class="px-6 py-3 border-b border-default shrink-0">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-medium text-muted">YAML 源数据</p>
              <p class="text-xs text-muted mt-1">{{ yamlLineCount }} 行</p>
            </div>
            <UBadge color="primary" variant="soft" size="xs">唯一数据源</UBadge>
          </div>
        </div>

        <div class="flex-1 min-h-0 p-4">
          <YamlEditor
            :model-value="modelValue"
            :readonly="isBuiltIn"
            @update:model-value="updateYaml"
          />
        </div>
      </section>
    </div>
  </div>
</template>
