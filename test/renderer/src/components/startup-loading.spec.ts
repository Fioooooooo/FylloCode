import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StartupLoading from "@renderer/components/shared/StartupLoading.vue";

describe("StartupLoading", () => {
  it("renders an accessible indeterminate startup status", () => {
    const wrapper = mount(StartupLoading);
    const status = wrapper.get('[role="status"]');

    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.attributes("aria-busy")).toBe("true");
    expect(wrapper.text()).toContain("正在启动 FylloCode…");
    expect(wrapper.text()).not.toMatch(/\d+%/);
    expect(wrapper.get("img").attributes("src")).toContain("icon.svg");
    expect(wrapper.get(".fyllo-startup-content").classes()).toContain("fyllo-startup-content");
    expect(wrapper.get(".fyllo-startup-ring").classes()).toContain("fyllo-startup-ring");
    expect(wrapper.find("path").exists()).toBe(false);
  });
});
