import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ShowTimeSignal from "@renderer/features/fyllo-signal/ui/signals/ShowTimeSignal.vue";

describe("ShowTimeSignal", () => {
  it("owns its clock icon, pill styling, and label without interaction", () => {
    const wrapper = mount(ShowTimeSignal, {
      props: {
        payload: { label: "2026-07-24 10:30" },
      },
      global: {
        stubs: {
          UIcon: {
            props: ["name"],
            template: '<span data-test="ui-icon" :data-icon="name" />',
          },
        },
      },
    });

    const pill = wrapper.get("[data-fyllo-signal-show-time]");
    expect(pill.classes()).toContain("rounded-full");
    expect(wrapper.get("[data-icon-name]").attributes("data-icon-name")).toBe("i-lucide-clock-3");
    expect(pill.text()).toContain("2026-07-24 10:30");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(pill.attributes("tabindex")).toBeUndefined();
  });
});
