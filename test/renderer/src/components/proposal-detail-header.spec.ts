import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProposalDetailHeader from "@renderer/components/proposal/ProposalDetailHeader.vue";
import type { ApplyRunMeta, ProposalMeta } from "@shared/types/proposal";

function buildProposal(status: ProposalMeta["status"]): ProposalMeta {
  return {
    id: "proposal-1",
    title: "Proposal 1",
    status,
    why: "why",
    totalTasks: 2,
    doneTasks: 1,
    hasDesign: true,
    date: "2026-05-07",
  };
}

function buildRunMeta(overrides: Partial<ApplyRunMeta> = {}): ApplyRunMeta {
  return {
    runId: "run-1",
    changeId: "proposal-1",
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
  workflowMenuItems: [],
  workflowStoreLoading: false,
  runMeta: null,
  isArchiving: false,
  isStreaming: false,
  canArchive: false,
  refreshingMeta: false,
} satisfies Omit<InstanceType<typeof ProposalDetailHeader>["$props"], "proposal">;

describe("ProposalDetailHeader", () => {
  it("shows a run-history button for archived proposals", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("archived"),
        ...defaultProps,
        changeId: "2026-05-07-proposal-1",
      },
    });

    const button = wrapper.findAll("button").find((node) => node.text().includes("查看运行历史"));
    expect(button).toBeDefined();

    button?.trigger("click");
    expect(wrapper.emitted("view-run-history")?.length).toBeGreaterThan(0);
  });

  it("shows archive-ready badge when the done run matches the proposal", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("applying"),
        ...defaultProps,
        runMeta: buildRunMeta(),
        canArchive: true,
      },
    });

    expect(wrapper.text()).toContain("可归档");
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
        runMeta: buildRunMeta({ changeId: "other-proposal" }),
      },
    });

    expect(wrapper.text()).toContain("实现中");
    expect(wrapper.text()).not.toContain("可归档");
  });

  it("renders the workflow menu inside the detail slideover overlay", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("draft"),
        ...defaultProps,
        workflowMenuItems: [[{ label: "Workflow 1", onSelect: () => undefined }]],
      },
    });

    expect(wrapper.get('div[portal="false"]').text()).toContain("开始实现");
  });
});
