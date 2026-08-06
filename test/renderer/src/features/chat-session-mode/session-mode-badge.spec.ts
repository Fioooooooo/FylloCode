import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SessionModeBadge from "@renderer/features/chat-session-mode/ui/SessionModeBadge.vue";

const tooltipStub = {
  props: ["text"],
  template: '<div data-test="mode-tooltip" :data-tooltip="text"><slot /></div>',
};

const badgeStub = {
  inheritAttrs: true,
  props: ["color", "variant", "size"],
  template:
    '<span v-bind="$attrs" :data-color="color" :data-variant="variant" :data-size="size"><slot /></span>',
};

describe("SessionModeBadge", () => {
  it("uses the neutral soft badge and native presentation without decorative motion", () => {
    const wrapper = mount(SessionModeBadge, {
      props: { sessionMode: "native" },
      global: {
        stubs: { UTooltip: tooltipStub, Tooltip: tooltipStub, UBadge: badgeStub, Badge: badgeStub },
      },
    });
    const badge = wrapper.get('[data-test="session-mode-badge"]');

    expect(badge.text()).toBe("原生");
    expect(badge.attributes("data-color")).toBe("neutral");
    expect(badge.attributes("data-variant")).toBe("soft");
    expect(badge.attributes("tabindex")).toBe("0");
    expect(badge.classes()).toContain("rounded-full");
    expect(badge.classes()).not.toContain("transition-all");
    expect(badge.classes()).not.toContain("shadow");
    expect(wrapper.get('[data-test="mode-tooltip"]').attributes("data-tooltip")).toBe(
      "保持 Agent 默认的工作方式，不做改变。"
    );
  });
});
