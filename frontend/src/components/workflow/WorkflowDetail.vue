<script setup lang="ts">
import { computed, ref } from "vue";
import { load } from "js-yaml";
import { useToast } from "@nuxt/ui/composables";
import YamlEditor from "./YamlEditor.vue";
import type { WorkflowStage, WorkflowStageType, WorkflowTemplate } from "@shared/types/workflow";

type StageBadgeColor = "primary" | "info" | "success" | "warning" | "neutral";

type RawWorkflow = {
  name?: unknown;
  description?: unknown;
  version?: unknown;
  stages?: unknown;
};

type RawStage = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  agent?: unknown;
  prompt?: unknown;
  when?: unknown;
  onFailure?: unknown;
  mcp?: unknown;
  skills?: unknown;
};

type ParsedWorkflow = {
  name: string;
  description: string;
  version: string;
  stages: WorkflowStage[];
};

const props = defineProps<{
  modelValue: string;
  template: WorkflowTemplate | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  cancel: [];
  save: [payload: { name: string; yaml: string }];
}>();

const toast = useToast();
const parseError = ref("");

const workflowStageTypes = new Set<WorkflowStageType>([
  "proposal-apply",
  "proposal-archive",
  "code-review",
  "security-check",
  "create-pr",
  "custom",
]);

const isBuiltIn = computed(() => props.template?.source === "built-in");
const yamlLineCount = computed(() => props.modelValue.split("\n").length);
const parsedWorkflow = computed(() => parseWorkflowYaml(props.modelValue, props.template?.name));

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function toStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => toStringValue(item)).filter((item): item is string => Boolean(item));
}

function parseStageType(value: unknown): WorkflowStageType {
  if (typeof value === "string" && workflowStageTypes.has(value as WorkflowStageType)) {
    return value as WorkflowStageType;
  }

  if (value === "apply") {
    return "proposal-apply";
  }

  if (value === "archive") {
    return "proposal-archive";
  }

  return "custom";
}

function parseWorkflowYaml(source: string, fallbackName = "新工作流"): ParsedWorkflow {
  try {
    const document = load(source) as RawWorkflow | null;
    parseError.value = "";

    if (!document || typeof document !== "object") {
      return {
        name: fallbackName,
        description: "暂无描述",
        version: "1",
        stages: [],
      };
    }

    const stages = Array.isArray(document.stages)
      ? document.stages
          .filter((stage): stage is RawStage => typeof stage === "object" && stage !== null)
          .map((stage, index) => {
            const id = toStringValue(stage.id) ?? `stage-${index + 1}`;
            return {
              id,
              name: toStringValue(stage.name) ?? id,
              type: parseStageType(stage.type),
              agent: toStringValue(stage.agent),
              prompt: toStringValue(stage.prompt),
              when: toStringValue(stage.when),
              onFailure: toStringValue(stage.onFailure),
              mcp: toStringList(stage.mcp),
              skills: toStringList(stage.skills),
            };
          })
      : [];

    return {
      name: toStringValue(document.name) ?? fallbackName,
      description: toStringValue(document.description) ?? "暂无描述",
      version: toStringValue(document.version) ?? "1",
      stages,
    };
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error);
    return {
      name: fallbackName,
      description: "YAML 格式有误",
      version: "1",
      stages: [],
    };
  }
}

function stageColor(type: WorkflowStageType): StageBadgeColor {
  const colorMap: Record<WorkflowStageType, StageBadgeColor> = {
    "proposal-apply": "primary",
    "proposal-archive": "neutral",
    "code-review": "info",
    "security-check": "warning",
    "create-pr": "success",
    custom: "neutral",
  };

  return colorMap[type];
}

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

    <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-default shrink-0">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-highlighted truncate">
          {{ parsedWorkflow.name }}
        </h1>
        <p class="text-xs text-muted mt-1 truncate">
          {{ parsedWorkflow.description }}
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <UBadge color="neutral" variant="soft">v{{ parsedWorkflow.version }}</UBadge>
        <UBadge v-if="isBuiltIn" color="neutral" variant="soft">内置</UBadge>
        <UBadge v-else color="primary" variant="soft">自定义</UBadge>
        <UButton variant="ghost" color="neutral" size="sm" label="取消" @click="emit('cancel')" />
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
        <div class="flex items-center justify-between gap-3 mb-3">
          <p class="text-xs font-medium text-muted">从 YAML 渲染的阶段预览</p>
          <UBadge color="neutral" variant="soft" size="xs">
            {{ parsedWorkflow.stages.length }} 个阶段
          </UBadge>
        </div>

        <div v-if="parseError" class="text-sm text-error py-8">
          {{ parseError }}
        </div>
        <div v-else-if="parsedWorkflow.stages.length === 0" class="text-sm text-muted py-8">
          YAML 中尚未定义阶段。
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="(stage, index) in parsedWorkflow.stages"
            :key="`${stage.id}-${index}`"
            class="rounded-md border border-default bg-elevated px-4 py-3"
          >
            <div class="flex items-start gap-3">
              <UBadge variant="soft" color="neutral" size="xs" class="mt-0.5">
                {{ index + 1 }}
              </UBadge>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <h2 class="text-sm font-medium text-highlighted truncate">
                    {{ stage.name }}
                  </h2>
                  <UBadge :color="stageColor(stage.type)" size="xs">
                    {{ stage.type }}
                  </UBadge>
                </div>

                <div class="grid grid-cols-2 gap-x-5 gap-y-2 mt-3 text-xs">
                  <div>
                    <p class="text-muted">id</p>
                    <p class="text-highlighted font-mono mt-0.5 truncate">{{ stage.id }}</p>
                  </div>
                  <div>
                    <p class="text-muted">agent</p>
                    <p class="text-highlighted font-mono mt-0.5 truncate">
                      {{ stage.agent ?? "codex" }}
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
            </div>
          </div>
        </div>
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
