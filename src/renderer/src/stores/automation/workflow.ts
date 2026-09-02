import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { workflowApi } from "@renderer/api/automation/workflow";
import { useWorkspaceStore } from "../workspace/workspace";
import type { WorkflowDefinitionRecord } from "@shared/types/workflow";

export function createWorkflowYaml(): string {
  return `name: 新工作流
version: 2
description: 描述这个工作流适用于什么执行场景
requires: []
confirmStart: false

stages:
  - id: implement
    kind: agent
    context: fresh
    prompt: 在当前 Workspace 中完成需要的修改。
    produces: { id: result, schema: freeform }
    next: [{ on: pass, goto: verify }]

  - id: verify
    kind: action
    op: { type: exec, command: "pnpm test" }
    confirm: false
    terminal: true
`;
}

function operationError(message: string, code?: string): Error & { code?: string } {
  return Object.assign(new Error(message), code ? { code } : {});
}

export const useWorkflowStore = defineStore("workflow", () => {
  const workflows = ref<WorkflowDefinitionRecord[]>([]);
  const selectedWorkflowId = ref<string | null>(null);
  const rawYaml = ref("");
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<Error | null>(null);
  let requestGeneration = 0;

  const selectedWorkflow = computed(
    () =>
      workflows.value.find((workflow) => workflow.workflowId === selectedWorkflowId.value) ?? null
  );
  const isDraft = computed(() => selectedWorkflowId.value === null);

  function getCurrentWorkspaceId(): string {
    const workspaceId = useWorkspaceStore().currentWorkspace?.id;
    if (!workspaceId) throw new Error("当前没有打开的 Workspace");
    return workspaceId;
  }

  function selectWorkflow(workflowId: string): void {
    const workflow = workflows.value.find((candidate) => candidate.workflowId === workflowId);
    if (!workflow) return;
    selectedWorkflowId.value = workflow.workflowId;
    rawYaml.value = workflow.yaml;
    error.value = null;
  }

  function startNewWorkflow(): void {
    selectedWorkflowId.value = null;
    rawYaml.value = createWorkflowYaml();
    error.value = null;
  }

  function clearSelection(): void {
    selectedWorkflowId.value = null;
    rawYaml.value = "";
    error.value = null;
  }

  async function fetchDefinitions(workspaceId = getCurrentWorkspaceId()): Promise<void> {
    const generation = ++requestGeneration;
    isLoading.value = true;
    error.value = null;
    try {
      const result = await workflowApi.list({ workspaceId });
      if (!result.ok) throw operationError(result.error.message, result.error.code);
      if (
        generation !== requestGeneration ||
        useWorkspaceStore().currentWorkspace?.id !== workspaceId
      ) {
        return;
      }
      workflows.value = result.data.workflows;
      const selected = result.data.workflows.find(
        (workflow) => workflow.workflowId === selectedWorkflowId.value
      );
      if (selected) {
        rawYaml.value = selected.yaml;
      } else if (result.data.workflows[0]) {
        selectWorkflow(result.data.workflows[0].workflowId);
      } else {
        clearSelection();
      }
    } catch (caught) {
      if (generation === requestGeneration) {
        error.value = caught instanceof Error ? caught : new Error(String(caught));
      }
      throw caught;
    } finally {
      if (generation === requestGeneration) isLoading.value = false;
    }
  }

  async function saveDefinition(yaml = rawYaml.value): Promise<WorkflowDefinitionRecord> {
    const workspaceId = getCurrentWorkspaceId();
    const generation = ++requestGeneration;
    isSaving.value = true;
    error.value = null;
    try {
      const result = await workflowApi.save({
        workspaceId,
        ...(selectedWorkflowId.value ? { workflowId: selectedWorkflowId.value } : {}),
        yaml,
      });
      if (!result.ok) throw operationError(result.error.message, result.error.code);
      if (
        generation !== requestGeneration ||
        useWorkspaceStore().currentWorkspace?.id !== workspaceId
      ) {
        return result.data;
      }
      const index = workflows.value.findIndex(
        (workflow) => workflow.workflowId === result.data.workflowId
      );
      if (index === -1) workflows.value.push(result.data);
      else workflows.value.splice(index, 1, result.data);
      selectedWorkflowId.value = result.data.workflowId;
      rawYaml.value = result.data.yaml;
      return result.data;
    } catch (caught) {
      if (generation === requestGeneration) {
        error.value = caught instanceof Error ? caught : new Error(String(caught));
      }
      throw caught;
    } finally {
      if (generation === requestGeneration) isSaving.value = false;
    }
  }

  async function deleteDefinition(workflowId = selectedWorkflowId.value): Promise<void> {
    if (!workflowId) return;
    const workspaceId = getCurrentWorkspaceId();
    const generation = ++requestGeneration;
    error.value = null;
    const result = await workflowApi.delete({ workspaceId, workflowId });
    if (!result.ok) {
      const caught = operationError(result.error.message, result.error.code);
      error.value = caught;
      throw caught;
    }
    if (
      generation !== requestGeneration ||
      useWorkspaceStore().currentWorkspace?.id !== workspaceId
    ) {
      return;
    }
    workflows.value = workflows.value.filter((workflow) => workflow.workflowId !== workflowId);
    if (selectedWorkflowId.value === workflowId) clearSelection();
  }

  return {
    workflows,
    selectedWorkflowId,
    selectedWorkflow,
    rawYaml,
    isDraft,
    isLoading,
    isSaving,
    error,
    fetchDefinitions,
    selectWorkflow,
    startNewWorkflow,
    clearSelection,
    saveDefinition,
    deleteDefinition,
  };
});
