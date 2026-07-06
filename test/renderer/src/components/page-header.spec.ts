import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PageHeader from "@renderer/components/shared/PageHeader.vue";

describe("PageHeader", () => {
  it("renders the standard page heading copy", () => {
    const wrapper = mount(PageHeader, {
      props: {
        eyebrow: "Overview",
        title: "项目概览",
        description: "治理状态、活跃工作和最近脉络。",
      },
    });

    expect(wrapper.text()).toContain("Overview");
    expect(wrapper.text()).toContain("项目概览");
    expect(wrapper.text()).toContain("治理状态、活跃工作和最近脉络。");
  });

  it("does not render trailing slot content", () => {
    const wrapper = mount(PageHeader, {
      props: {
        eyebrow: "Tasks",
        title: "任务看板",
        description: "集中查看任务，并快速发起 AI 讨论。",
      },
      slots: {
        default: '<button type="button">新建任务</button>',
      },
    });

    expect(wrapper.find("button").exists()).toBe(false);
  });
});
