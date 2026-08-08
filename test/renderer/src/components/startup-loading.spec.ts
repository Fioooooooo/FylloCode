import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Logo from "@renderer/components/shared/Logo.vue";
import StartupLoading from "@renderer/components/shared/StartupLoading.vue";

describe("StartupLoading", () => {
  it("renders the shared dot-matrix lockup with the generated Logo fallback", () => {
    const wrapper = shallowMount(StartupLoading);

    expect(wrapper.findComponent(Logo).exists()).toBe(true);
    expect(wrapper.findComponent(Logo).classes()).toContain("fyllo-startup-logo");
    expect(wrapper.findAll(".fyllo-startup-dot-band")).toHaveLength(6);
    expect(wrapper.find(".fyllo-startup-wordmark").text()).toBe("FylloCode");
    expect(wrapper.find(".fyllo-startup-status").text()).toBe("正在启动…");
  });

  it("exposes the startup status semantics without replaying the static-page delay", () => {
    const wrapper = shallowMount(StartupLoading);
    const status = wrapper.get(".fyllo-startup-overlay");
    const css = readFileSync(resolve(process.cwd(), "src/renderer/src/assets/startup.css"), "utf8");

    expect(status.attributes("role")).toBe("status");
    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.attributes("aria-busy")).toBe("true");
    expect(wrapper.get(".fyllo-startup-stage").attributes("aria-hidden")).toBe("true");
    expect(wrapper.get(".fyllo-startup-sr-only").text()).toBe("正在启动 FylloCode…");
    expect(css).toMatch(/\.fyllo-startup-status\s*{[\s\S]*opacity:\s*1/);
    expect(css).toMatch(
      /\.fyllo-startup-page \.fyllo-startup-status\s*{[\s\S]*animation:\s*fyllo-startup-status-reveal/
    );
    expect(css).not.toMatch(/\.fyllo-startup-overlay \.fyllo-startup-status\s*{[\s\S]*animation:/);
  });
});
