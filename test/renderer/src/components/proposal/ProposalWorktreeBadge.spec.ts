import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProposalWorktreeBadge from "@renderer/components/proposal/ProposalWorktreeBadge.vue";

describe("ProposalWorktreeBadge", () => {
  it("renders linked worktree indicator and exposes path when worktreePath is provided", () => {
    const wrapper = mount(ProposalWorktreeBadge, {
      props: { worktreePath: "/tmp/project/.worktrees/change-1" },
    });

    const badge = wrapper.find('[data-test="proposal-worktree-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.find('[data-icon-name="i-lucide-git-branch"]').exists()).toBe(true);
    expect(
      badge.find('[aria-label="Linked worktree: /tmp/project/.worktrees/change-1"]').exists()
    ).toBe(true);
    expect(badge.find('[title="/tmp/project/.worktrees/change-1"]').exists()).toBe(true);
  });

  it("does not render anything when worktreePath is missing", () => {
    const wrapper = mount(ProposalWorktreeBadge, {
      props: { worktreePath: undefined },
    });

    expect(wrapper.find('[data-test="proposal-worktree-badge"]').exists()).toBe(false);
    expect(wrapper.find('[data-icon-name="i-lucide-git-branch"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("does not render anything when worktreePath is null", () => {
    const wrapper = mount(ProposalWorktreeBadge, {
      props: { worktreePath: null },
    });

    expect(wrapper.find('[data-test="proposal-worktree-badge"]').exists()).toBe(false);
    expect(wrapper.find('[data-icon-name="i-lucide-git-branch"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });
});
