import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContextUsageRing from "@renderer/components/chat/prompt/ContextUsageRing.vue";

const tooltipStub = {
  template:
    '<div data-test="tooltip"><slot /><div data-test="tooltip-content"><slot name="content" /></div></div>',
};

function mountUsage(
  used: number,
  size = 1000,
  cost?: { amount: number; currency: string }
): VueWrapper {
  return mount(ContextUsageRing, {
    props: {
      used,
      size,
      ...(cost ? { cost } : {}),
    },
    global: {
      stubs: {
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
      },
    },
  });
}

function getTooltipRows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test="tooltip-content"] > div > div');
}

describe("ContextUsageRing", () => {
  it.each([
    {
      used: 740,
      colorClasses: ["text-success"],
      advice: null,
    },
    {
      used: 750,
      colorClasses: ["text-warning"],
      advice: "Context 占用过高，请留意后续用量",
    },
    {
      used: 900,
      colorClasses: ["text-orange-500", "dark:text-orange-400"],
      advice: "请新建会话或总结当前对话",
    },
    {
      used: 950,
      colorClasses: ["text-error"],
      advice: "下一次提问可能失败，请新建会话",
    },
  ])("maps $used tokens to the expected context status", ({ used, colorClasses, advice }) => {
    const wrapper = mountUsage(used);
    const progressCircle = wrapper.get("svg circle:nth-of-type(2)");
    const rows = getTooltipRows(wrapper);

    expect(progressCircle.classes()).toEqual(expect.arrayContaining(colorClasses));
    expect(rows[0]?.text()).toContain("Context:");

    if (advice === null) {
      expect(rows).toHaveLength(1);
      expect(wrapper.text()).not.toContain("建议:");
    } else {
      expect(rows).toHaveLength(2);
      expect(rows[1]?.text()).toContain("建议:");
      expect(rows[1]?.text()).toContain(advice);
    }
  });

  it.each([
    { used: 7499, expectedLabel: "74", expectedColor: "text-success" },
    { used: 8999, expectedLabel: "89", expectedColor: "text-warning" },
    { used: 9499, expectedLabel: "94", expectedColor: "text-orange-500" },
  ])(
    "floors $used / 10000 without entering the next status early",
    ({ used, expectedLabel, expectedColor }) => {
      const wrapper = mountUsage(used, 10_000);

      expect(wrapper.get("svg tspan").text()).toBe(expectedLabel);
      expect(wrapper.get("svg circle:nth-of-type(2)").classes()).toContain(expectedColor);
    }
  );

  it("omits remaining and cost details from visible and screen-reader tooltip text", () => {
    const wrapper = mountUsage(800, 1000, { amount: 0.045, currency: "USD" });
    const tooltipContent = wrapper.get('[data-test="tooltip-content"]').text();
    const screenReaderText = wrapper.get(".sr-only").text();

    expect(tooltipContent).toContain("Context:");
    expect(tooltipContent).toContain("建议:");
    expect(tooltipContent).not.toContain("Remaining");
    expect(tooltipContent).not.toContain("Cost");
    expect(tooltipContent).not.toContain("USD");
    expect(screenReaderText).toBe(
      "Context: 0.8K / 1K tokens (80%)\n建议: Context 占用过高，请留意后续用量"
    );
    expect(screenReaderText).not.toContain("Remaining");
    expect(screenReaderText).not.toContain("Cost");
    expect(screenReaderText).not.toContain("USD");
  });
});
