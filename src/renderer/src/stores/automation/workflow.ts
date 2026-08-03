import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { workflowApi } from "@renderer/api/automation/workflow";
import { useWorkspaceStore } from "../workspace/workspace";
import type { WorkflowTemplate } from "@shared/types/workflow";

export const useWorkflowStore = defineStore("workflow", () => {
  const templates = ref<WorkflowTemplate[]>([]);
  const isLoading = ref(false);
  let loadGeneration = 0;

  const builtInTemplates = computed(() =>
    templates.value.filter((template) => template.source === "built-in")
  );
  const customTemplates = computed(() =>
    templates.value.filter((template) => template.source === "custom")
  );

  function getCurrentWorkspaceId(): string {
    const workspaceId = useWorkspaceStore().currentWorkspace?.id;
    if (!workspaceId) {
      throw new Error("当前没有打开的 Project 或 Workspace");
    }
    return workspaceId;
  }

  async function fetchTemplates(workspaceId = getCurrentWorkspaceId()): Promise<void> {
    const requestGeneration = ++loadGeneration;
    isLoading.value = true;
    try {
      const result = await workflowApi.list({ workspaceId });
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      if (
        requestGeneration !== loadGeneration ||
        useWorkspaceStore().currentWorkspace?.id !== workspaceId
      ) {
        return;
      }
      templates.value = result.data.templates;
    } finally {
      if (
        requestGeneration === loadGeneration &&
        useWorkspaceStore().currentWorkspace?.id === workspaceId
      ) {
        isLoading.value = false;
      }
    }
  }

  async function saveTemplate(name: string, yaml: string): Promise<void> {
    const workspaceId = getCurrentWorkspaceId();
    const result = await workflowApi.save({
      name,
      yaml,
      workspaceId,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    await fetchTemplates(workspaceId);
  }

  async function deleteTemplate(name: string): Promise<void> {
    const workspaceId = getCurrentWorkspaceId();
    const result = await workflowApi.delete({
      name,
      workspaceId,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    await fetchTemplates(workspaceId);
  }

  return {
    templates,
    builtInTemplates,
    customTemplates,
    isLoading,
    fetchTemplates,
    saveTemplate,
    deleteTemplate,
  };
});
