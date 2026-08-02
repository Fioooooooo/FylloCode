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

vi.mock("@renderer/stores/proposal/browser", () => ({
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
    proposalRef: { folderId: "folder-a", changeId: "change-1" },
    folderName: "Repository A",
    title: "Change 1",
    status: "draft",
    why: "Why text",
    totalTasks: 3,
    doneTasks: 1,
    hasDesign: true,
    date: "2026-06-12",
    worktreeMode: "main",
    worktreePath: "/repo-a",
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
        proposalRef: { folderId: "folder-b", changeId: "change-2" },
        folderName: "Repository B",
        title: "Change 2",
        status: "applying",
        worktreeMode: "linked",
        worktreePath: "/tmp/project/.worktrees/change-2",
      }),
      proposal({
        id: "2026-06-22-change-3",
        proposalRef: { folderId: "folder-a", changeId: "change-3" },
        title: "Change 3",
        status: "archived",
      }),
    ];
  });

  it("loads proposals on mount and renders the full list", () => {
    const wrapper = mount(ProposalPage);

    expect(mocks.loadProposals).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("变更提案");
    expect(wrapper.text()).toContain("Change 1");
    expect(wrapper.text()).toContain("Change 2");
    expect(wrapper.text()).toContain("Change 3");
  });

  it("aligns the page header with the proposal list width", () => {
    const wrapper = mount(ProposalPage);

    expect(wrapper.get('[data-test="proposal-page-header"]').classes()).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-3xl"])
    );
    expect(wrapper.get('[data-test="proposal-page-content"]').classes()).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-3xl"])
    );
  });

  it("does not render stats cards or status tabs", () => {
    const wrapper = mount(ProposalPage);

    expect(wrapper.find('[data-test="proposal-stats-cards"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="tab-all"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="tab-applying"]').exists()).toBe(false);
  });

  it("opens proposal detail slideover when a card is clicked", async () => {
    const wrapper = mount(ProposalPage);

    await wrapper
      .findAll('[data-test="proposal-list-item"]')
      .find((button) => button.text().includes("Change 1"))
      ?.trigger("click");

    expect(mocks.openProposalDetail).toHaveBeenCalledWith({
      folderId: "folder-a",
      changeId: "change-1",
    });
  });

  it("opens same-named proposals with their distinct Folder owner", async () => {
    proposalsValue = [
      proposal(),
      proposal({
        proposalRef: { folderId: "folder-b", changeId: "change-1" },
        folderName: "Repository B",
        title: "Change 1 in B",
        worktreePath: "/repo-b",
      }),
    ];
    const wrapper = mount(ProposalPage);
    const items = wrapper.findAll('[data-test="proposal-list-item"]');

    await items[1]!.trigger("click");

    expect(mocks.openProposalDetail).toHaveBeenCalledWith({
      folderId: "folder-b",
      changeId: "change-1",
    });
    expect(wrapper.findAll('[data-test="proposal-owner"]').map((item) => item.text())).toEqual([
      "Repository A",
      "Repository B",
    ]);
  });

  it("shows linked worktree indicator for proposals with a worktree path", () => {
    const wrapper = mount(ProposalPage);

    const items = wrapper.findAll('[data-test="proposal-list-item"]');
    const applyingItem = items.find((item) => item.text().includes("Change 2"));
    const draftItem = items.find((item) => item.text().includes("Change 1"));

    expect(applyingItem!.find('[data-test="proposal-worktree-badge"]').exists()).toBe(true);
    expect(draftItem!.find('[data-test="proposal-worktree-badge"]').exists()).toBe(false);
  });
});
