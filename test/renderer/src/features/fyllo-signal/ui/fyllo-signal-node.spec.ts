import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FylloSignalNode from "@renderer/features/fyllo-signal/ui/FylloSignalNode.vue";

const UIconStub = {
  props: ["name"],
  template: '<span data-test="ui-icon" :data-icon="name" />',
};

describe("FylloSignalNode", () => {
  it("routes a ready payload to its exact type component", () => {
    const wrapper = mount(FylloSignalNode, {
      props: {
        node: {
          attrs: { type: "show.time" },
          content: '{"label":"2026-07-24 10:30"}',
        },
      },
      global: {
        stubs: { UIcon: UIconStub },
      },
    });

    expect(wrapper.attributes("data-fyllo-signal-type")).toBe("show.time");
    expect(wrapper.get("[data-fyllo-signal-show-time]").text()).toContain("2026-07-24 10:30");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.attributes("data-fyllo-action-id")).toBeUndefined();
  });

  it("renders a generic non-interactive diagnostic for invalid input", () => {
    const wrapper = mount(FylloSignalNode, {
      props: {
        node: {
          attrs: { type: "show.time" },
          content: "{}",
        },
      },
    });

    const diagnostic = wrapper.get("[data-fyllo-signal-invalid]");
    expect(diagnostic.attributes("role")).toBe("status");
    expect(diagnostic.text()).toContain("Signal 无效");
    expect(diagnostic.text()).toContain("label");
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
