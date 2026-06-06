<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useToast } from "@nuxt/ui/composables";
import WorkflowDetail from "@renderer/components/workflow/WorkflowDetail.vue";
import WorkflowSidebar from "@renderer/components/workflow/WorkflowSidebar.vue";
import { useProjectStore } from "@renderer/stores/project";
import { useWorkflowStore } from "@renderer/stores/workflow";
import type { WorkflowTemplate } from "@shared/types/workflow";

type CurrentView = "empty" | "template-editor";

const workflowStore = useWorkflowStore();
const projectStore = useProjectStore();
const toast = useToast();

const currentView = ref<CurrentView>("empty");
const selectedTemplateId = ref<string | null>(null);
const yamlContent = ref("");
const draftTemplate = ref<WorkflowTemplate | null>(null);
const isSaving = ref(false);

const selectedTemplate = computed(() => {
  if (draftTemplate.value) {
    return draftTemplate.value;
  }

  return (
    workflowStore.templates.find((template) => template.id === selectedTemplateId.value) ?? null
  );
});

function createDefaultYaml(): string {
  return `name: 新工作流
description: 描述这个工作流适用于什么执行场景
version: 1
stages:
  - id: apply
    name: 应用变更
    type: proposal-apply
    agent: codex
    prompt: 按照已确认的 proposal 任务实施代码变更。
    when: proposal 状态为“准备执行”
    onFailure: 停止后续阶段
    mcp:
      - 文件系统
    skills:
      - openspec-apply-change`;
}

async function fetchTemplates(): Promise<void> {
  try {
    await workflowStore.fetchTemplates();
  } catch (error) {
    toast.add({
      title: "加载工作流失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

function selectTemplate(id: string): void {
  const template = workflowStore.templates.find((item) => item.id === id);
  if (!template) {
    return;
  }

  draftTemplate.value = null;
  selectedTemplateId.value = id;
  currentView.value = "template-editor";
  yamlContent.value = template.yaml;
}

function createTemplate(): void {
  const yaml = createDefaultYaml();
  draftTemplate.value = {
    id: "draft",
    name: "新工作流",
    description: "描述这个工作流适用于什么执行场景",
    version: 1,
    source: "custom",
    yaml,
    stages: [
      {
        id: "apply",
        name: "应用变更",
        type: "proposal-apply",
        agent: "codex",
        prompt: "按照已确认的 proposal 任务实施代码变更。",
        when: "proposal 状态为“准备执行”",
        onFailure: "停止后续阶段",
        mcp: ["文件系统"],
        skills: ["openspec-apply-change"],
      },
    ],
  };
  selectedTemplateId.value = null;
  currentView.value = "template-editor";
  yamlContent.value = yaml;
}

function cancelEditing(): void {
  currentView.value = "empty";
  selectedTemplateId.value = null;
  draftTemplate.value = null;
  yamlContent.value = "";
}

async function deleteTemplate(id: string): Promise<void> {
  const template =
    workflowStore.templates.find((item) => item.id === id) ??
    workflowStore.templates.find((item) => item.name === id);

  if (!template) {
    return;
  }

  try {
    await workflowStore.deleteTemplate(template.name);
    cancelEditing();
    toast.add({
      title: "删除成功",
      description: `已删除工作流模板「${template.name}」`,
    });
  } catch (error) {
    toast.add({
      title: "删除工作流失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

function handleDetailDelete(): void {
  if (!selectedTemplate.value) {
    return;
  }

  void deleteTemplate(selectedTemplate.value.name);
}

async function saveTemplate(payload: { name: string; yaml: string }): Promise<void> {
  isSaving.value = true;
  const isCopySave = selectedTemplate.value?.source === "built-in";
  try {
    await workflowStore.saveTemplate(payload.name, payload.yaml);
    draftTemplate.value = null;
    yamlContent.value = payload.yaml;
    selectedTemplateId.value = payload.name;
    toast.add({
      title: isCopySave ? "复制并保存成功" : "保存 YAML 成功",
    });
  } catch (error) {
    toast.add({
      title: "保存工作流失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void fetchTemplates();
});

watch(
  () => projectStore.currentProject?.id,
  async () => {
    cancelEditing();
    await fetchTemplates();
  }
);
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <WorkflowSidebar
      :custom-templates="workflowStore.customTemplates"
      :built-in-templates="workflowStore.builtInTemplates"
      :selected-template-id="selectedTemplateId"
      :loading="workflowStore.isLoading"
      @select="selectTemplate"
      @create="createTemplate"
      @delete="deleteTemplate"
    />

    <main class="flex-1 min-w-0 flex flex-col bg-default">
      <div v-if="currentView === 'empty'" class="flex flex-1 items-center justify-center h-full">
        <div class="flex flex-col items-center text-center">
          <UIcon name="i-lucide-workflow" class="w-10 h-10 text-muted" />
          <p class="text-sm font-medium text-highlighted mt-3">选择或新建工作流模板</p>
          <p class="text-xs text-muted mt-1">编辑 YAML，并从 YAML 渲染工作流预览</p>
        </div>
      </div>

      <WorkflowDetail
        v-else
        v-model="yamlContent"
        :template="selectedTemplate"
        :saving="isSaving"
        @save="saveTemplate"
        @delete="handleDetailDelete"
      />
    </main>
  </div>
</template>
