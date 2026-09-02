import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProposalDetailHeader from "@renderer/components/proposal/ProposalDetailHeader.vue";
import type { ProposalMeta } from "@shared/types/proposal";

function buildProposal(status: ProposalMeta["status"]): ProposalMeta {
  return {
    id: "proposal-1",
    proposalRef: { folderId: "folder-a", changeId: "proposal-1" },
    folderName: "Repository A",
    title: "Proposal 1",
    status,
    why: "why",
    totalTasks: 2,
    doneTasks: 1,
    hasDesign: true,
    date: "2026-05-07",
    worktreeMode: "main",
    worktreePath: "/repo-a",
  };
}

const defaultProps = {
  changeId: "proposal-1",
  refreshingMeta: false,
} satisfies Omit<InstanceType<typeof ProposalDetailHeader>["$props"], "proposal">;

describe("ProposalDetailHeader", () => {
  it("does not show a run-history button for archived proposals", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("archived"),
        ...defaultProps,
        changeId: "2026-05-07-proposal-1",
      },
    });

    const button = wrapper.findAll("button").find((node) => node.text().includes("查看运行历史"));
    expect(button).toBeUndefined();
  });

  it("shows archive-ready badge when every task is done without run metadata", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: { ...buildProposal("applying"), doneTasks: 2 },
        ...defaultProps,
      },
    });

    expect(wrapper.text()).toContain("可归档");
    expect(wrapper.findAll("button").some((button) => button.text() === "归档")).toBe(false);
  });

  it("keeps applying badge while tasks remain", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
      },
    });

    expect(wrapper.text()).toContain("实现中");
    expect(wrapper.text()).not.toContain("可归档");
  });

  it("keeps applying badge when an applying proposal has no tasks", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: { ...buildProposal("applying"), totalTasks: 0, doneTasks: 0 },
        ...defaultProps,
      },
    });

    expect(wrapper.text()).toContain("实现中");
    expect(wrapper.text()).not.toContain("可归档");
  });

  it("does not render the workflow menu for draft proposals", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("draft"),
        ...defaultProps,
      },
    });

    expect(wrapper.text()).not.toContain("开始实现");
    expect(wrapper.find('[data-test="dropdown-item-Workflow 1"]').exists()).toBe(false);
  });

  it("does not render workflow actions or run status strips", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
      },
    });

    expect(wrapper.text()).not.toContain("阶段");
    expect(wrapper.text()).not.toContain("查看运行历史");
  });
});
