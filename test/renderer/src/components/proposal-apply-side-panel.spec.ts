import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProposalApplySidePanel from "@renderer/components/proposal/ProposalApplySidePanel.vue";

describe("ProposalApplySidePanel", () => {
  it("shows an empty state when opened without run history", () => {
    const wrapper = mount(ProposalApplySidePanel, {
      props: {
        runMeta: null,
        messages: [],
        isStreaming: false,
      },
    });

    expect(wrapper.text()).toContain("暂无运行记录");
    expect(wrapper.text()).toContain("这个 proposal 还没有可查看的历史日志。");
  });
});
