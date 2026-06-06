import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { workflowApi } from "@renderer/api/workflow";
import { useProjectStore } from "./project";
import type { WorkflowTemplate } from "@shared/types/workflow";

export const useWorkflowStore = defineStore("workflow", () => {
  const templates = ref<WorkflowTemplate[]>([]);
  const isLoading = ref(false);

  const builtInTemplates = computed(() =>
    templates.value.filter((template) => template.source === "built-in")
  );
  const customTemplates = computed(() =>
    templates.value.filter((template) => template.source === "custom")
  );

  function getCurrentProjectId(): string | undefined {
    return useProjectStore().currentProject?.id;
  }

  async function fetchTemplates(): Promise<void> {
    isLoading.value = true;
    try {
      const result = await workflowApi.list({ projectId: getCurrentProjectId() });
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      templates.value = result.data.templates;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveTemplate(name: string, yaml: string): Promise<void> {
    const result = await workflowApi.save({
      name,
      yaml,
      projectId: getCurrentProjectId(),
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    await fetchTemplates();
  }

  async function deleteTemplate(name: string): Promise<void> {
    const result = await workflowApi.delete({
      name,
      projectId: getCurrentProjectId(),
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    await fetchTemplates();
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
