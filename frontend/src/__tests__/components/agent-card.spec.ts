import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AgentCard from "@renderer/components/settings/AgentCard.vue";
import type { AcpAgentEntry, AcpAgentStatus } from "@shared/types/acp-agent";

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
    uvx: { package: "@openai/codex" },
    binary: { darwin: { archive: "https://example.com/agent.tar.gz", cmd: "claude" } },
  },
};

function mounted(status?: Partial<AcpAgentStatus>) {
  return mount(AgentCard, {
    props: {
      agent,
      userDataPath: "/Users/test/Library/Application Support/FylloCode",
      agentStatus: {
        id: "claude-code",
        installed: true,
        managedBy: "fyllocode",
        installMethod: "npx",
        updateAvailable: false,
        latestVersion: "1.2.3",
        ...status,
      },
    },
  });
}

describe("AgentCard uninstall", () => {
  it("renders uninstall menu when installed and hides it when not installed", () => {
    const installedWrapper = mounted();
    expect(installedWrapper.find('[data-test="dropdown-item-卸载"]').exists()).toBe(true);
    expect(installedWrapper.find('[data-test="agent-card-uninstall-menu"]').exists()).toBe(true);

    const uninstalledWrapper = mount(AgentCard, {
      props: {
        agent,
        agentStatus: {
          id: "claude-code",
          installed: false,
          managedBy: null,
          updateAvailable: false,
          latestVersion: "1.2.3",
        },
      },
    });
    expect(uninstalledWrapper.find('[data-test="dropdown-item-卸载"]').exists()).toBe(false);
    expect(uninstalledWrapper.find('[data-test="agent-card-uninstall-menu"]').exists()).toBe(false);
  });

  it("disables uninstall while another agent is being processed", () => {
    const wrapper = mount(AgentCard, {
      props: {
        agent,
        agentStatus: {
          id: "claude-code",
          installed: true,
          managedBy: "fyllocode",
          installMethod: "npx",
          updateAvailable: false,
          latestVersion: "1.2.3",
        },
        actionDisabled: true,
      },
    });

    const uninstallItem = wrapper.find('[data-test="dropdown-item-卸载"]');
    expect(uninstallItem.exists()).toBe(true);
    expect(uninstallItem.attributes("disabled")).toBeDefined();
    expect(uninstallItem.attributes("title")).toBe("其他 Agent 正在处理中");
  });

  it("prefers website for the external link and falls back to repository", () => {
    const websiteWrapper = mounted();
    const websiteLink = websiteWrapper.find('[data-test="agent-card-external-link"]');
    expect(websiteLink.exists()).toBe(true);
    expect(websiteLink.attributes("href")).toBe(agent.website);
    expect(websiteLink.attributes("target")).toBe("_blank");
    expect(websiteLink.attributes("rel")).toBe("noreferrer");

    const repositoryOnlyWrapper = mount(AgentCard, {
      props: {
        agent: {
          ...agent,
          website: undefined,
        },
      },
    });
    expect(
      repositoryOnlyWrapper.find('[data-test="agent-card-external-link"]').attributes("href")
    ).toBe(agent.repository);
  });

  it("hides the external link when neither website nor repository exists", () => {
    const wrapper = mount(AgentCard, {
      props: {
        agent: {
          ...agent,
          repository: undefined,
          website: undefined,
        },
      },
    });

    expect(wrapper.find('[data-test="agent-card-external-link"]').exists()).toBe(false);
  });

  it("does not render license or authors text", () => {
    const wrapper = mounted();

    expect(wrapper.text()).not.toContain("MIT");
    expect(wrapper.text()).not.toContain("Anthropic");
  });

  it.each([
    [
      "fyllocode",
      "npx",
      "npm uninstall -g @anthropic/claude-code",
      "卸载完成后将清除本地安装记录。",
      "卸载",
    ],
    [
      "fyllocode",
      "uvx",
      "uv tool uninstall @openai/codex",
      "卸载完成后将清除本地安装记录。",
      "卸载",
    ],
    [
      "fyllocode",
      "binary",
      "/Users/test/Library/Application Support/FylloCode/acp/bin/claude-code",
      "卸载完成后将清除本地安装记录。",
      "卸载",
    ],
    [
      "user",
      "npx",
      "npm uninstall -g @anthropic/claude-code",
      "此操作会修改你的全局环境，不可撤销。",
      "同意并卸载",
    ],
    [
      "user",
      "uvx",
      "uv tool uninstall @openai/codex",
      "此操作会修改你的全局环境，不可撤销。",
      "同意并卸载",
    ],
    [
      "user",
      "binary",
      "/Users/test/Library/Application Support/FylloCode/acp/bin/claude-code",
      "此操作不可撤销。",
      "同意并卸载",
    ],
  ])(
    "renders the uninstall modal copy for %s managed %s agents",
    async (managedBy, installMethod, commandText, footnote, buttonLabel) => {
      const wrapper = mounted({
        managedBy: managedBy as "user" | "fyllocode",
        installMethod: installMethod as "npx" | "uvx" | "binary",
      });

      const uninstallButton = wrapper.find('[data-test="dropdown-item-卸载"]');
      expect(uninstallButton.exists()).toBe(true);
      await uninstallButton.trigger("click");

      expect(wrapper.text()).toContain("卸载 Claude Code？");
      expect(wrapper.text()).toContain(commandText);
      expect(wrapper.text()).toContain(footnote);
      expect(wrapper.text()).toContain(buttonLabel);
    }
  );

  it("closes the modal on cancel without emitting uninstall", async () => {
    const wrapper = mounted();

    await wrapper.find('[data-test="dropdown-item-卸载"]').trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "取消")!
      .trigger("click");

    expect(wrapper.emitted("uninstall")).toBeUndefined();
  });

  it("emits uninstall(agentId) on confirm", async () => {
    const wrapper = mounted();

    await wrapper.find('[data-test="dropdown-item-卸载"]').trigger("click");

    const uninstallButtons = wrapper
      .findAll("button")
      .filter((button) => button.text().trim() === "卸载");
    expect(uninstallButtons).toHaveLength(2);
    await uninstallButtons[1]!.trigger("click");

    expect(wrapper.emitted("uninstall")).toEqual([["claude-code"]]);
  });
});
