import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProposalDetailHeader from "@renderer/components/proposal/ProposalDetailHeader.vue";
import type { ProposalMeta } from "@shared/types/proposal";

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

describe("ProposalDetailHeader", () => {
  it("shows a run-history button for archived proposals", () => {
    const wrapper = mount(ProposalDetailHeader, {
      props: {
        proposal: buildProposal("archived"),
        changeId: "2026-05-07-proposal-1",
        workflowMenuItems: [],
        workflowStoreLoading: false,
        runMeta: null,
        isStreaming: false,
        canArchive: false,
      },
    });

    const button = wrapper.findAll("button").find((node) => node.text().includes("查看运行历史"));
    expect(button).toBeDefined();

    button?.trigger("click");
    expect(wrapper.emitted("view-run-history")?.length).toBeGreaterThan(0);
  });
});
