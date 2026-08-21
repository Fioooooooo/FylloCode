import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsAgentsPage from "@renderer/pages/settings/acp-agents.vue";
import { useAcpAgentsStore } from "@renderer/stores/platform/acp-agents";

describe("SettingsAgentsPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("owns the Agents page and initializes its store", () => {
    const store = useAcpAgentsStore();
    const ensureInitialized = vi.spyOn(store, "ensureInitialized").mockResolvedValue();

    const wrapper = mount(SettingsAgentsPage, {
      global: {
        stubs: {
          AgentCard: true,
        },
      },
    });

    expect(wrapper.text()).toContain("ACP Agents");
    expect(wrapper.text()).toContain("支持 Agent Client Protocol 的 CLI Agent。");
    expect(wrapper.get('[data-testid="curated-agents-note"]').text()).toContain("FylloCode 精选");
    expect(wrapper.get('[data-testid="curated-agents-note"]').text()).toContain(
      "优先收录活跃维护、使用广泛或 ACP 适配良好的 Agent。"
    );
    const curatedLink = wrapper.get('[data-testid="curated-agents-link"]');
    expect(curatedLink.text()).toContain("点击查看");
    expect(curatedLink.attributes("href")).toBe("https://curated-acp-agents.onrender.com/");
    expect(curatedLink.attributes("target")).toBe("_blank");
    expect(curatedLink.attributes("rel")).toBe("noreferrer");
    expect(ensureInitialized).toHaveBeenCalledTimes(1);
  });
});
