import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowPage from "@renderer/pages/workflow.vue";
import { useToast } from "@nuxt/ui/composables";

const workflowStore = {
  templates: [
    {
      id: "built-in-1",
      name: "Built-in Workflow",
      source: "built-in" as const,
      yaml: "name: Built-in Workflow\nstages: []",
      stages: [],
    },
    {
      id: "custom-1",
      name: "Custom Workflow",
      source: "custom" as const,
      yaml: "name: Custom Workflow\nstages: []",
      stages: [],
    },
  ],
  customTemplates: [
    {
      id: "custom-1",
      name: "Custom Workflow",
      source: "custom" as const,
      yaml: "name: Custom Workflow\nstages: []",
      stages: [],
    },
  ],
  builtInTemplates: [
    {
      id: "built-in-1",
      name: "Built-in Workflow",
      source: "built-in" as const,
      yaml: "name: Built-in Workflow\nstages: []",
      stages: [],
    },
  ],
  isLoading: false,
  fetchTemplates: vi.fn().mockResolvedValue(undefined),
  saveTemplate: vi.fn().mockResolvedValue(undefined),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
};

const projectStore = {
  currentProject: null,
};

vi.mock("@renderer/stores/workflow", () => ({
  useWorkflowStore: vi.fn(() => workflowStore),
}));

vi.mock("@renderer/stores/project", () => ({
  useProjectStore: vi.fn(() => projectStore),
}));

const workflowSidebarStub = {
  props: ["customTemplates", "builtInTemplates", "selectedTemplateId", "loading"],
  emits: ["select", "create", "delete"],
  template: `
    <div>
      <button data-test="sidebar-select-built-in" type="button" @click="$emit('select', 'built-in-1')">
        select built-in
      </button>
      <button data-test="sidebar-select-custom" type="button" @click="$emit('select', 'custom-1')">
        select custom
      </button>
      <button data-test="sidebar-delete-custom" type="button" @click="$emit('delete', 'custom-1')">
        delete custom
      </button>
    </div>
  `,
};

const workflowDetailStub = {
  props: ["modelValue", "template", "saving"],
  emits: ["cancel", "save", "delete"],
  template: `
    <div>
      <button data-test="detail-save" type="button" @click="$emit('save', { name: template?.name, yaml: modelValue })">
        save
      </button>
      <button data-test="detail-delete" type="button" @click="$emit('delete')">
        delete
      </button>
    </div>
  `,
};

describe("workflow page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes templates from both sidebar and detail actions", async () => {
    const toast = useToast();
    const wrapper = mount(WorkflowPage, {
      global: {
        stubs: {
          WorkflowSidebar: workflowSidebarStub,
          WorkflowDetail: workflowDetailStub,
        },
      },
    });

    await flushPromises();

    await wrapper.find('[data-test="sidebar-select-custom"]').trigger("click");
    await nextTick();

    await wrapper.find('[data-test="sidebar-delete-custom"]').trigger("click");
    await flushPromises();

    expect(workflowStore.deleteTemplate).toHaveBeenCalledWith("Custom Workflow");
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "删除成功",
      })
    );
    expect(wrapper.text()).toContain("选择或新建工作流模板");

    await wrapper.find('[data-test="sidebar-select-custom"]').trigger("click");
    await nextTick();

    await wrapper.find('[data-test="detail-delete"]').trigger("click");
    await flushPromises();

    expect(workflowStore.deleteTemplate).toHaveBeenCalledTimes(2);
    expect(workflowStore.deleteTemplate).toHaveBeenLastCalledWith("Custom Workflow");
    expect(wrapper.text()).toContain("选择或新建工作流模板");
  });

  it("shows distinct success toasts for copy-save and yaml-save", async () => {
    const toast = useToast();
    const wrapper = mount(WorkflowPage, {
      global: {
        stubs: {
          WorkflowSidebar: workflowSidebarStub,
          WorkflowDetail: workflowDetailStub,
        },
      },
    });

    await flushPromises();

    await wrapper.find('[data-test="sidebar-select-built-in"]').trigger("click");
    await nextTick();
    await wrapper.find('[data-test="detail-save"]').trigger("click");
    await flushPromises();

    expect(workflowStore.saveTemplate).toHaveBeenCalledWith(
      "Built-in Workflow",
      "name: Built-in Workflow\nstages: []"
    );
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "复制并保存成功",
      })
    );

    await wrapper.find('[data-test="sidebar-select-custom"]').trigger("click");
    await nextTick();
    await wrapper.find('[data-test="detail-save"]').trigger("click");
    await flushPromises();

    expect(workflowStore.saveTemplate).toHaveBeenLastCalledWith(
      "Custom Workflow",
      "name: Custom Workflow\nstages: []"
    );
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "保存 YAML 成功",
      })
    );
  });
});
