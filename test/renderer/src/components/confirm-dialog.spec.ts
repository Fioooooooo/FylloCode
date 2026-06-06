import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConfirmDialog from "@renderer/components/shared/ConfirmDialog.vue";

describe("ConfirmDialog", () => {
  it("renders title, description, and custom action labels", () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        title: "删除任务",
        description: "此操作不可撤销。",
        cancelLabel: "返回",
        confirmLabel: "删除",
        confirmColor: "error",
      },
    });

    expect(wrapper.text()).toContain("删除任务");
    expect(wrapper.text()).toContain("此操作不可撤销。");
    expect(wrapper.text()).toContain("返回");
    expect(wrapper.text()).toContain("删除");
    expect(wrapper.find('[data-icon-name="i-lucide-triangle-alert"]').classes()).toContain(
      "text-error"
    );
  });

  it("falls back to warning icon tone for non-error confirms", () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        title: "接管更新",
        confirmColor: "primary",
      },
    });

    expect(wrapper.find('[data-icon-name="i-lucide-triangle-alert"]').classes()).toContain(
      "text-warning"
    );
  });

  it("emits close(false) on cancel and close(true) on confirm", async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        title: "接管更新",
      },
    });

    const buttons = wrapper.findAll("button");
    await buttons[0]!.trigger("click");
    await buttons[1]!.trigger("click");

    expect(wrapper.emitted("close")).toEqual([[false], [true]]);
  });
});
