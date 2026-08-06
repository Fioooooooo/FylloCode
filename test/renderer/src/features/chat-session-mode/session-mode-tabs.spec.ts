import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SessionModeTabs from "@renderer/features/chat-session-mode/ui/SessionModeTabs.vue";

const tooltipStub = {
  props: ["text"],
  template: '<div data-test="mode-tooltip" :data-tooltip="text"><slot /></div>',
};

function mountTabs() {
  return mount(SessionModeTabs, {
    props: { modelValue: "fyllocode" },
    global: { stubs: { UTooltip: tooltipStub, Tooltip: tooltipStub } },
  });
}

describe("SessionModeTabs", () => {
  it("renders a compact two-option tablist with the shared tooltip copy", () => {
    const wrapper = mountTabs();
    const tabs = wrapper.findAll('[role="tab"]');
    const visibleLabel = wrapper.get('[data-test="session-mode-control"] > span');
    const tablist = wrapper.get('[role="tablist"]');

    expect(visibleLabel.text()).toBe("会话模式");
    expect(tablist.attributes("aria-labelledby")).toBe(visibleLabel.attributes("id"));
    expect(tablist.classes()).toContain("w-fit");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.text()).toBe("FylloCode");
    expect(tabs[1]?.text()).toBe("原生");
    expect(tabs[0]?.attributes("aria-selected")).toBe("true");
    expect(tabs[1]?.attributes("aria-selected")).toBe("false");
    expect(wrapper.findAll('[data-test="mode-tooltip"]')[1]?.attributes("data-tooltip")).toBe(
      "保持 Agent 默认的工作方式，不做改变。"
    );
  });

  it("emits mode changes from clicks and keyboard navigation with visible focus styles", async () => {
    const wrapper = mountTabs();
    const fylloTab = wrapper.get('[aria-label="FylloCode"]');

    expect(fylloTab.classes()).toContain("focus-visible:ring-2");
    await wrapper.get('[aria-label="原生"]').trigger("click");
    await fylloTab.trigger("keydown", { key: "ArrowRight" });

    expect(wrapper.emitted("update:modelValue")).toEqual([["native"], ["native"]]);
    expect(wrapper.emitted("change")).toEqual([["native"], ["native"]]);
  });
});
