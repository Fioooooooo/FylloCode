import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FylloSignalShell from "@renderer/features/fyllo-signal/ui/FylloSignalShell.vue";

describe("FylloSignalShell", () => {
  it("provides only a host container, data attributes, and slot", () => {
    const wrapper = mount(FylloSignalShell, {
      props: {
        type: "show.time",
        isDark: true,
        customId: "message-1",
        indexKey: 2,
      },
      slots: {
        default: '<span data-test="signal-content">content</span>',
      },
    });

    expect(wrapper.element.tagName).toBe("SPAN");
    expect(wrapper.attributes()).toEqual({
      "data-fyllo-signal-type": "show.time",
      "data-custom-id": "message-1",
      "data-index-key": "2",
      "data-theme": "dark",
    });
    expect(wrapper.classes()).toEqual([]);
    expect(wrapper.get('[data-test="signal-content"]').text()).toBe("content");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.find("svg").exists()).toBe(false);
  });
});
