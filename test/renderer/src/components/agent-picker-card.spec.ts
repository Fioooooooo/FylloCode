import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AgentPickerCard from "@renderer/components/chat/empty/AgentPickerCard.vue";
import type { AcpAgentEntry, AcpAgentStatus, AcpInstallProgress } from "@shared/types/acp-agent";

const agent: AcpAgentEntry = {
  id: "claude-code",
  name: "Claude Code",
  version: "1.2.3",
  description: "ACP agent",
  authors: ["Anthropic"],
  license: "MIT",
  repository: "https://github.com/anthropics/claude-code",
  website: "https://claude.ai/code",
  distribution: {
    npx: { package: "@anthropic/claude-code" },
  },
};

function mountCard(
  options: {
    agentStatus?: Partial<AcpAgentStatus>;
    installProgress?: AcpInstallProgress;
    selected?: boolean;
    selectable?: boolean;
    installDisabled?: boolean;
  } = {}
) {
  return mount(AgentPickerCard, {
    props: {
      agent,
      agentStatus: {
        id: agent.id,
        installed: true,
        managedBy: "fyllocode",
        updateAvailable: false,
        ...options.agentStatus,
      },
      installProgress: options.installProgress,
      selected: options.selected,
      selectable: options.selectable,
      installDisabled: options.installDisabled,
    },
  });
}

describe("AgentPickerCard", () => {
  it("emits select only for installed selectable agents", async () => {
    const wrapper = mountCard({ selectable: true });

    await wrapper.trigger("click");
    expect(wrapper.emitted("select")).toEqual([[agent.id]]);

    const uninstalledWrapper = mountCard({
      selectable: true,
      agentStatus: {
        installed: false,
        managedBy: null,
      },
    });
    await uninstalledWrapper.trigger("click");
    expect(uninstalledWrapper.emitted("select")).toBeUndefined();
  });

  it("keeps picker actions limited to install and retry", async () => {
    const installWrapper = mountCard({
      agentStatus: {
        installed: false,
        managedBy: null,
      },
    });

    expect(installWrapper.text()).toContain("安装");
    expect(installWrapper.text()).not.toContain("更新");
    expect(installWrapper.text()).not.toContain("卸载");
    expect(installWrapper.find('[data-test="agent-card-external-link"]').exists()).toBe(false);

    await installWrapper.find("button").trigger("click");
    expect(installWrapper.emitted("install")).toEqual([[agent.id]]);

    const retryWrapper = mountCard({
      agentStatus: {
        installed: false,
        managedBy: null,
      },
      installProgress: {
        agentId: agent.id,
        status: "error",
      },
    });

    expect(retryWrapper.text()).toContain("重试");
    expect(retryWrapper.text()).not.toContain("更新");
    expect(retryWrapper.text()).not.toContain("卸载");
  });

  it("renders the selected indicator without exposing management actions", () => {
    const wrapper = mountCard({ selected: true, selectable: true });

    expect(wrapper.find('[data-icon-name="i-lucide-check-circle-2"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("更新");
    expect(wrapper.text()).not.toContain("卸载");
  });
});
