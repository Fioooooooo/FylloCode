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
    expect(ensureInitialized).toHaveBeenCalledTimes(1);
  });
});
