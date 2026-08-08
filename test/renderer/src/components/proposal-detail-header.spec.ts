import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProposalDetailHeader from "@renderer/components/proposal/ProposalDetailHeader.vue";
import type { ApplyRunMeta, ProposalMeta } from "@shared/types/proposal";

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

function buildRunMeta(overrides: Partial<ApplyRunMeta> = {}): ApplyRunMeta {
  return {
    runId: "run-1",
    proposalRef: { folderId: "folder-a", changeId: "proposal-1" },
    worktreePath: "/repo-a",
    workflowId: "workflow-1",
    stages: [],
    currentStageIndex: 0,
    stageAcpSessionIds: {},
    status: "done",
    startedAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

const defaultProps = {
  changeId: "proposal-1",
  runMeta: null,
  isArchiving: false,
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

  it("shows archive-ready badge when the done run matches the proposal", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
        runMeta: buildRunMeta(),
      },
    });

    expect(wrapper.text()).toContain("可归档");
    expect(wrapper.findAll("button").some((button) => button.text() === "归档")).toBe(false);
  });

  it("shows archiving badge while archive is running for the matching proposal", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
        runMeta: buildRunMeta({ status: "running", workflowId: "archive" }),
        isArchiving: true,
      },
    });

    expect(wrapper.text()).toContain("归档中");
    expect(wrapper.text()).not.toContain("可归档");
  });

  it("keeps applying badge when the done run belongs to another proposal", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
        runMeta: buildRunMeta({
          proposalRef: { folderId: "folder-a", changeId: "other-proposal" },
        }),
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

  it("keeps the applying run status strip", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
        runMeta: buildRunMeta({
          status: "running",
          stages: [{ id: "stage-1", name: "实现", type: "proposal-apply" }],
        }),
      },
    });

    expect(wrapper.text()).toContain("workflow-1");
    expect(wrapper.text()).toContain("阶段 1/1：实现");
  });
});
