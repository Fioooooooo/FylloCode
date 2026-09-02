import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowPage from "@renderer/pages/workflow.vue";
import { useToast } from "@nuxt/ui/composables";

const workflowStore = {
  workflows: [] as Array<{ workflowId: string; name: string; yaml: string }>,
  selectedWorkflowId: null as string | null,
  selectedWorkflow: null as { workflowId: string; name: string; yaml: string } | null,
  rawYaml: "",
  isDraft: true,
  isLoading: false,
  isSaving: false,
  error: null as Error | null,
  fetchDefinitions: vi.fn().mockResolvedValue(undefined),
  selectWorkflow: vi.fn(),
  startNewWorkflow: vi.fn(() => {
    workflowStore.selectedWorkflowId = null;
    workflowStore.selectedWorkflow = null;
    workflowStore.isDraft = true;
    workflowStore.rawYaml = "name: New\nversion: 2";
  }),
  clearSelection: vi.fn(),
  saveDefinition: vi.fn().mockResolvedValue({ name: "New" }),
  deleteDefinition: vi.fn().mockResolvedValue(undefined),
};

const workspaceStore = { currentWorkspace: { id: "workspace-a" } };

vi.mock("@renderer/stores/automation/workflow", () => ({
  useWorkflowStore: vi.fn(() => workflowStore),
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: vi.fn(() => workspaceStore),
}));

const yamlEditorStub = {
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: '<textarea data-test="yaml-editor" :value="modelValue" />',
};

describe("workflow page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflowStore.workflows = [];
    workflowStore.selectedWorkflowId = null;
    workflowStore.selectedWorkflow = null;
    workflowStore.rawYaml = "";
    workflowStore.isDraft = true;
    workflowStore.isLoading = false;
    workflowStore.isSaving = false;
    workflowStore.error = null;
    workflowStore.fetchDefinitions.mockResolvedValue(undefined);
    workflowStore.saveDefinition.mockResolvedValue({ name: "New" });
    workflowStore.deleteDefinition.mockResolvedValue(undefined);
  });

  it("mounts the definition editor and starts a v2 draft", async () => {
    const wrapper = mount(WorkflowPage, {
      global: { stubs: { YamlEditor: yamlEditorStub } },
    });
    await flushPromises();

    expect(workflowStore.fetchDefinitions).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-test="workflow-new"]').trigger("click");
    expect(workflowStore.startNewWorkflow).toHaveBeenCalledTimes(1);
    expect(workflowStore.rawYaml).toContain("version: 2");
  });

  it("saves raw YAML and deletes the selected definition by workflowId", async () => {
    const selected = { workflowId: "workflow-1", name: "Demo", yaml: "name: Demo\nversion: 2" };
    workflowStore.workflows = [selected];
    workflowStore.selectedWorkflowId = selected.workflowId;
    workflowStore.selectedWorkflow = selected;
    workflowStore.isDraft = false;
    workflowStore.rawYaml = selected.yaml;
    const wrapper = mount(WorkflowPage, {
      global: { stubs: { YamlEditor: yamlEditorStub } },
    });
    await flushPromises();

    await wrapper.get('[data-test="workflow-save"]').trigger("click");
    await flushPromises();
    expect(workflowStore.saveDefinition).toHaveBeenCalledWith();

    await wrapper.get('[data-test="workflow-delete"]').trigger("click");
    await flushPromises();
    expect(workflowStore.deleteDefinition).toHaveBeenCalledWith("workflow-1");
    expect(useToast().add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "删除 Workflow definition 成功" })
    );
  });
});
