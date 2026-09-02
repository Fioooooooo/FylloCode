<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useToast } from "@nuxt/ui/composables";
import YamlEditor from "@renderer/components/workflow/YamlEditor.vue";
import { useWorkflowStore, useWorkspaceStore } from "@renderer/stores";

const workflowStore = useWorkflowStore();
const workspaceStore = useWorkspaceStore();
const toast = useToast();

async function refresh(): Promise<void> {
  try {
    await workflowStore.fetchDefinitions();
  } catch (error) {
    toast.add({
      title: "加载工作流失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

function startNew(): void {
  workflowStore.startNewWorkflow();
}

async function save(): Promise<void> {
  try {
    const definition = await workflowStore.saveDefinition();
    toast.add({ title: "保存 Workflow definition 成功", description: definition.name });
  } catch (error) {
    toast.add({
      title: "保存 Workflow definition 失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

async function remove(): Promise<void> {
  const workflowId = workflowStore.selectedWorkflowId;
  const name = workflowStore.selectedWorkflow?.name ?? workflowId;
  if (!workflowId) return;
  try {
    await workflowStore.deleteDefinition(workflowId);
    toast.add({ title: "删除 Workflow definition 成功", description: name ?? undefined });
  } catch (error) {
    toast.add({
      title: "删除 Workflow definition 失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

onMounted(() => {
  void refresh();
});

watch(
  () => workspaceStore.currentWorkspace?.id,
  () => {
    workflowStore.clearSelection();
    if (workspaceStore.currentWorkspace) void refresh();
  }
);
</script>

<template>
  <div class="flex flex-1 min-h-0 gap-2 overflow-hidden bg-elevated">
    <aside class="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg bg-default">
      <div class="flex items-center justify-between border-b border-default px-3 py-2">
        <div>
          <p class="text-sm font-medium text-highlighted">Workflows</p>
          <p class="text-xs text-muted">Workspace definitions</p>
        </div>
        <UButton
          data-test="workflow-new"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          aria-label="新建 Workflow definition"
          @click="startNew"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <p v-if="workflowStore.isLoading" class="px-2 py-3 text-xs text-muted">加载中…</p>
        <p v-else-if="workflowStore.workflows.length === 0" class="px-2 py-3 text-xs text-muted">
          当前 Workspace 尚无 definition
        </p>
        <button
          v-for="workflow in workflowStore.workflows"
          :key="workflow.workflowId"
          type="button"
          class="mb-1 w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-elevated"
          :class="
            workflowStore.selectedWorkflowId === workflow.workflowId
              ? 'bg-primary/15 text-primary'
              : 'text-highlighted'
          "
          @click="workflowStore.selectWorkflow(workflow.workflowId)"
        >
          <span class="block truncate text-sm font-medium">{{ workflow.name }}</span>
          <span class="mt-0.5 block truncate font-mono text-[10px] text-muted">
            {{ workflow.workflowId }}
          </span>
        </button>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-default">
      <div
        class="flex shrink-0 items-center justify-between gap-4 border-b border-default px-5 py-3"
      >
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold text-highlighted">
            {{
              workflowStore.selectedWorkflow?.name ??
              (workflowStore.isDraft ? "新建 Workflow" : "Workflow")
            }}
          </h1>
          <p class="mt-1 text-xs text-muted">
            {{ workflowStore.selectedWorkflowId ?? "尚未保存，保存后分配 workflowId" }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <UButton
            v-if="workflowStore.selectedWorkflowId"
            data-test="workflow-delete"
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-trash-2"
            label="删除"
            @click="remove"
          />
          <UButton
            data-test="workflow-save"
            color="primary"
            size="sm"
            icon="i-lucide-save"
            label="保存 YAML"
            :loading="workflowStore.isSaving"
            @click="save"
          />
        </div>
      </div>

      <div
        v-if="workflowStore.error"
        data-test="workflow-error"
        class="shrink-0 border-b border-error/30 bg-error/10 px-5 py-2 text-sm text-error"
      >
        {{ workflowStore.error.message }}
      </div>

      <div class="min-h-0 flex-1 p-4">
        <YamlEditor v-model="workflowStore.rawYaml" />
      </div>
    </main>
  </div>
</template>
