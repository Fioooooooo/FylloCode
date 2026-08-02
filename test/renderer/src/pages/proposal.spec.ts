import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProposalPage from "@renderer/pages/proposal.vue";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { ProposalBrowserOverview, ProposalMeta } from "@shared/types/proposal";
import { workspaceInfo } from "../fixtures/workspace";

const mocks = vi.hoisted(() => ({
  loadProposals: vi.fn(),
  clear: vi.fn(),
  setFolderFilter: vi.fn((folderId: string | null) => {
    selectedFolderIdValue = folderId;
  }),
  openProposalDetail: vi.fn(),
}));

let proposalsValue: ProposalMeta[] = [];
let dataValue: ProposalBrowserOverview | null = null;
let selectedFolderIdValue: string | null = null;
let loadingValue = false;
let errorValue: string | null = null;

vi.mock("@renderer/stores/proposal/browser", () => ({
  useProposalStore: () => ({
    get data() {
      return dataValue;
    },
    get proposals() {
      return proposalsValue;
    },
    get visibleProposals() {
      return selectedFolderIdValue
        ? proposalsValue.filter(
            (proposal) => proposal.proposalRef.folderId === selectedFolderIdValue
          )
        : proposalsValue;
    },
    get folders() {
      return dataValue?.folders ?? [];
    },
    get selectedFolderId() {
      return selectedFolderIdValue;
    },
    get loading() {
      return loadingValue;
    },
    get error() {
      return errorValue;
    },
    loadProposals: mocks.loadProposals,
    clear: mocks.clear,
    setFolderFilter: mocks.setFolderFilter,
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

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useWorkspaceStore().currentWorkspace = workspaceInfo({
    id: "project-1",
    name: "Project 1",
    folderPath: "/repo-a",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-06-10T00:00:00.000Z"),
  });
  return mount(ProposalPage, { global: { plugins: [pinia] } });
}

describe("proposal list page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadingValue = false;
    errorValue = null;
    selectedFolderIdValue = null;
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
    dataValue = {
      folders: [
        {
          folderId: "folder-a",
          folderName: "Repository A",
          folderPath: "/repo-a",
          isPrimary: true,
          status: "ready",
          items: proposalsValue.filter((item) => item.proposalRef.folderId === "folder-a"),
          warnings: [],
        },
        {
          folderId: "folder-b",
          folderName: "Repository B",
          folderPath: "/repo-b",
          isPrimary: false,
          status: "ready",
          items: proposalsValue.filter((item) => item.proposalRef.folderId === "folder-b"),
          warnings: [],
        },
      ],
      items: proposalsValue,
      completeness: "complete",
      excludedFolderIds: [],
    };
  });

  it("loads proposals on mount and renders the full list", () => {
    const wrapper = mountPage();

    expect(mocks.loadProposals).toHaveBeenCalledWith("project-1");
    expect(wrapper.text()).toContain("变更提案");
    expect(wrapper.text()).toContain("Change 1");
    expect(wrapper.text()).toContain("Change 2");
    expect(wrapper.text()).toContain("Change 3");
  });

  it("aligns the page header with the proposal list width", () => {
    const wrapper = mountPage();

    expect(wrapper.get('[data-test="proposal-page-header"]').classes()).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-3xl"])
    );
    expect(wrapper.get('[data-test="proposal-page-content"]').classes()).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-3xl"])
    );
  });

  it("does not render stats cards or status tabs", () => {
    const wrapper = mountPage();

    expect(wrapper.find('[data-test="proposal-stats-cards"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="tab-all"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="tab-applying"]').exists()).toBe(false);
  });

  it("opens proposal detail slideover when a card is clicked", async () => {
    const wrapper = mountPage();

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
    dataValue = {
      folders: dataValue!.folders,
      items: proposalsValue,
      completeness: "complete",
      excludedFolderIds: [],
    };
    const wrapper = mountPage();
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
    const wrapper = mountPage();

    const items = wrapper.findAll('[data-test="proposal-list-item"]');
    const applyingItem = items.find((item) => item.text().includes("Change 2"));
    const draftItem = items.find((item) => item.text().includes("Change 1"));

    expect(applyingItem!.find('[data-test="proposal-worktree-badge"]').exists()).toBe(true);
    expect(draftItem!.find('[data-test="proposal-worktree-badge"]').exists()).toBe(false);
  });

  it("filters cards without changing their ProposalRef owner", async () => {
    const wrapper = mountPage();

    await wrapper.get('[data-test="proposal-folder-filter"]').setValue("folder-b");
    wrapper.vm.$forceUpdate();
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll('[data-test="proposal-list-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.text()).toContain("Change 2");
    await items[0]!.trigger("click");
    expect(mocks.openProposalDetail).toHaveBeenCalledWith({
      folderId: "folder-b",
      changeId: "change-2",
    });
  });

  it("keeps ready proposals visible while exposing a missing Folder", async () => {
    dataValue!.folders[1]!.status = "missing";
    dataValue!.folders[1]!.items = [];
    dataValue!.completeness = "partial";
    dataValue!.excludedFolderIds = ["folder-b"];
    proposalsValue = proposalsValue.filter((item) => item.proposalRef.folderId === "folder-a");
    dataValue!.items = proposalsValue;
    const wrapper = mountPage();

    expect(wrapper.find('[data-test="proposal-partial-alert"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="Repository B：缺失"]').attributes("aria-label")).toBe(
      "Repository B：缺失"
    );
    expect(wrapper.findAll('[data-test="proposal-list-item"]')).toHaveLength(2);

    await wrapper.get('[data-test="proposal-folder-filter"]').setValue("folder-b");
    wrapper.vm.$forceUpdate();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="proposal-list"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Folder 不可用");
    expect(wrapper.text()).toContain("Repository B 当前不存在");
  });
});
