import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProposalPage from "@renderer/pages/proposal.vue";
import type { ProposalMeta } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  loadProposals: vi.fn(),
  openProposalDetail: vi.fn(),
}));

let proposalsValue: ProposalMeta[] = [];
let loadingValue = false;
let errorValue: string | null = null;

vi.mock("@renderer/stores/proposal", () => ({
  useProposalStore: () => ({
    get proposals() {
      return proposalsValue;
    },
    get loading() {
      return loadingValue;
    },
    get error() {
      return errorValue;
    },
    loadProposals: mocks.loadProposals,
  }),
}));

vi.mock("@renderer/composables/useProposalDetailSlideover", () => ({
  useProposalDetailSlideover: () => ({
    openProposalDetail: mocks.openProposalDetail,
  }),
}));

function proposal(overrides: Partial<ProposalMeta> = {}): ProposalMeta {
  return {
    id: "change-1",
    title: "Change 1",
    status: "draft",
    why: "Why text",
    totalTasks: 3,
    doneTasks: 1,
    hasDesign: true,
    date: "2026-06-12",
    ...overrides,
  };
}

describe("proposal list page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadingValue = false;
    errorValue = null;
    proposalsValue = [
      proposal(),
      proposal({
        id: "change-2",
        title: "Change 2",
        status: "applying",
        worktreePath: "/tmp/project/.worktrees/change-2",
      }),
      proposal({
        id: "2026-06-22-change-3",
        title: "Change 3",
        status: "archived",
      }),
    ];
  });

  it("loads proposals on mount and keeps summary metadata visible", () => {
    const wrapper = mount(ProposalPage);

    expect(mocks.loadProposals).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("变更提案");
    expect(wrapper.text()).toContain("Change 1");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("worktree");
  });

  it("opens proposal detail slideover when a card is clicked", async () => {
    const wrapper = mount(ProposalPage);

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Change 1"))
      ?.trigger("click");

    expect(mocks.openProposalDetail).toHaveBeenCalledWith("change-1");
  });

  it("filters proposals by status without changing card metadata", async () => {
    const wrapper = mount(ProposalPage);

    await wrapper.get('[data-test="tab-applying"]').trigger("click");

    expect(wrapper.text()).toContain("Change 2");
    expect(wrapper.text()).not.toContain("Change 1");
    expect(wrapper.text()).toContain("worktree");
  });
});
