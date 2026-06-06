import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorkflowDetail from "@renderer/components/workflow/WorkflowDetail.vue";

describe("WorkflowDetail", () => {
  it("shows a delete button for custom templates", async () => {
    const wrapper = mount(WorkflowDetail, {
      props: {
        modelValue: "name: Custom Workflow\ndescription: Workflow description",
        template: {
          id: "custom-1",
          name: "Custom Workflow",
          source: "custom",
          yaml: "name: Custom Workflow\ndescription: Workflow description",
          stages: [],
        },
        saving: false,
      },
    });

    const deleteButton = wrapper.findAll("button").find((button) => button.text().includes("删除"));
    expect(deleteButton).toBeDefined();
    expect(wrapper.findAll("button").some((button) => button.text().includes("取消"))).toBe(false);

    await deleteButton?.trigger("click");

    expect(wrapper.emitted("delete")?.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("Custom Workflow");
    expect(wrapper.text()).toContain("Workflow description");
  });
});
