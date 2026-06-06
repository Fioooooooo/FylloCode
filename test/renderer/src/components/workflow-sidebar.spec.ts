import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorkflowSidebar from "@renderer/components/workflow/WorkflowSidebar.vue";

describe("WorkflowSidebar", () => {
  it("shows a delete action for custom templates and emits the template id", async () => {
    const wrapper = mount(WorkflowSidebar, {
      props: {
        customTemplates: [
          {
            id: "custom-1",
            name: "Custom Workflow",
            source: "custom",
            yaml: "name: Custom Workflow",
            stages: [],
          },
        ],
        builtInTemplates: [
          {
            id: "built-in-1",
            name: "Built-in Workflow",
            source: "built-in",
            yaml: "name: Built-in Workflow",
            stages: [],
          },
        ],
        selectedTemplateId: null,
        loading: false,
      },
    });

    const deleteButton = wrapper.find('[data-test="dropdown-item-删除"]');
    expect(deleteButton.exists()).toBe(true);

    await deleteButton.trigger("click");

    expect(wrapper.emitted("delete")?.[0]).toEqual(["custom-1"]);
  });
});
