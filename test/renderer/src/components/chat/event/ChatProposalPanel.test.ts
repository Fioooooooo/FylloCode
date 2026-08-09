import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatProposalPanel from "@renderer/components/chat/event/ChatProposalPanel.vue";
import type { ApplyRunMeta, ProposalMeta } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  openProposalDetail: vi.fn(),
  sendMessage: vi.fn(),
  startRun: vi.fn(),
  startArchive: vi.fn(),
  fetchTemplates: vi.fn(),
  loadProposals: vi.fn(),
  upsertSessionProposal: vi.fn(),
  removeSessionProposal: vi.fn(),
}));

let runMetaValue: ApplyRunMeta | null = null;
let isArchivingValue = false;
let proposalStoreProposalsValue: ProposalMeta[] = [];
let customTemplatesValue = [{ id: "wf-1", name: "Standard Workflow" }];
let isLoadingValue = false;

vi.mock("@renderer/composables/useProposalDetailSlideover", () => ({
  useProposalDetailSlideover: () => ({
    openProposalDetail: mocks.openProposalDetail,
  }),
}));

vi.mock("@renderer/stores/workspace", () => ({
  useWorkspaceStore: () => ({ currentWorkspace: { id: "project-1" } }),
}));

vi.mock("@renderer/stores/automation", () => ({
  useWorkflowStore: () => ({
    get customTemplates() {
      return customTemplatesValue;
    },
    get isLoading() {
      return isLoadingValue;
    },
    fetchTemplates: mocks.fetchTemplates,
  }),
}));

vi.mock("@renderer/stores/proposal", () => ({
  useProposalRunStore: () => ({
    get runMeta() {
      return runMetaValue;
    },
    get isArchiving() {
      return isArchivingValue;
    },
    startRun: mocks.startRun,
    startArchive: mocks.startArchive,
  }),
  useProposalStore: () => ({
    get proposals() {
      return proposalStoreProposalsValue;
    },
    loadProposals: mocks.loadProposals,
  }),
}));

vi.mock("@renderer/stores/session", () => ({
  useChatStore: () => ({
    sendMessage: mocks.sendMessage,
  }),
  useSessionStore: () => ({
    activeSession: { id: "session-1" },
    upsertSessionProposal: mocks.upsertSessionProposal,
    removeSessionProposal: mocks.removeSessionProposal,
  }),
}));

function makeProposal(
  status: ProposalMeta["status"],
  overrides: Partial<ProposalMeta> = {}
): ProposalMeta {
  return {
    id: "change-1",
    proposalRef: { folderId: "folder-b", changeId: "change-1" },
    folderName: "Repository B",
    title: "Test Proposal",
    status,
    why: "",
    totalTasks: 0,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-06-18",
    worktreeMode: "main",
    worktreePath: "/repo-b",
    ...overrides,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ChatProposalPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    runMetaValue = null;
    isArchivingValue = false;
    proposalStoreProposalsValue = [];
    customTemplatesValue = [{ id: "wf-1", name: "Standard Workflow" }];
    isLoadingValue = false;
    mocks.sendMessage.mockResolvedValue(true);
  });

  it("shows direct start apply and view detail buttons for draft proposals", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft")] },
    });

    const startApplyButton = wrapper.get('[data-test="start-apply-button"]');
    expect(startApplyButton.attributes("data-icon")).toBeUndefined();
    expect(startApplyButton.text()).toBe("开始实现");
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="dropdown-item-Standard Workflow"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("开始实现");
    expect(wrapper.text()).toContain("查看详情");
  });

  it("sends an owner-qualified user message when start apply is clicked", async () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft")] },
    });

    await wrapper.get('[data-test="start-apply-button"]').trigger("click");
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledWith([
      {
        type: "text",
        text: "Start applying proposal: change-1 (folderId: folder-b)",
      },
    ]);
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.fetchTemplates).not.toHaveBeenCalled();
  });

  it("does not show archive button when an applying proposal has no tasks", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
  });

  it("shows archive-ready actions when every task is done without run metadata", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [makeProposal("applying", { totalTasks: 2, doneTasks: 2 })],
      },
    });

    const archiveButton = wrapper.get('[data-test="archive-button"]');
    expect(archiveButton.attributes("data-icon")).toBeUndefined();
    expect(archiveButton.text()).toBe("归档");
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("可归档");
    expect(wrapper.text()).toContain("归档");
  });

  it("keeps applying state while tasks remain even when run metadata is done", () => {
    runMetaValue = {
      runId: "run-1",
      proposalRef: { folderId: "folder-b", changeId: "change-1" },
      worktreePath: "/repo-b",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [makeProposal("applying", { totalTasks: 2, doneTasks: 1 })],
      },
    });

    expect(wrapper.text()).toContain("实现中");
    expect(wrapper.text()).not.toContain("可归档");
    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
  });

  it("keeps view detail before other action buttons", () => {
    runMetaValue = {
      runId: "run-1",
      proposalRef: { folderId: "folder-b", changeId: "change-1" },
      worktreePath: "/repo-b",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [makeProposal("applying", { totalTasks: 2, doneTasks: 2 })],
      },
    });
    const actionButtons = wrapper.findAll("button").map((button) => button.text());

    expect(actionButtons.indexOf("查看详情")).toBeLessThan(actionButtons.indexOf("归档"));
  });

  it("shows archiving badge and hides archive button while archive is running", () => {
    isArchivingValue = true;
    runMetaValue = {
      runId: "archive-1",
      proposalRef: { folderId: "folder-b", changeId: "change-1" },
      worktreePath: "/repo-b",
      workflowId: "archive",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "running",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [makeProposal("applying", { totalTasks: 2, doneTasks: 2 })],
      },
    });

    expect(wrapper.text()).toContain("归档中");
    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
  });

  it("sends an owner-qualified user message when archive is clicked", async () => {
    runMetaValue = {
      runId: "run-1",
      proposalRef: { folderId: "folder-b", changeId: "change-1" },
      worktreePath: "/repo-b",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [makeProposal("applying", { totalTasks: 2, doneTasks: 2 })],
      },
    });

    await wrapper.get('[data-test="archive-button"]').trigger("click");
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledWith([
      {
        type: "text",
        text: "Start archiving proposal: change-1 (folderId: folder-b)",
      },
    ]);
    expect(mocks.startArchive).not.toHaveBeenCalled();
  });

  it("does not show actions for creating proposals", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("creating")] },
    });

    expect(wrapper.find('[data-test="start-apply-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(false);
  });

  it("shows only view detail button for archived proposals", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("archived")] },
    });

    expect(wrapper.find('[data-test="start-apply-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
  });

  it("opens proposal detail slideover when view detail is clicked", async () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft")] },
    });

    await wrapper.get('[data-test="view-detail-button"]').trigger("click");

    expect(mocks.openProposalDetail).toHaveBeenCalledWith({
      folderId: "folder-b",
      changeId: "change-1",
    });
  });

  it("syncs the session proposal from the current proposal store after detail closes", async () => {
    const close = deferred();
    const latestProposal = makeProposal("applying", { doneTasks: 2, totalTasks: 3 });
    mocks.openProposalDetail.mockReturnValueOnce(close.promise);
    proposalStoreProposalsValue = [latestProposal];

    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft", { doneTasks: 1, totalTasks: 3 })] },
    });

    await wrapper.get('[data-test="view-detail-button"]').trigger("click");

    expect(mocks.openProposalDetail).toHaveBeenCalledWith({
      folderId: "folder-b",
      changeId: "change-1",
    });
    expect(mocks.upsertSessionProposal).not.toHaveBeenCalled();

    close.resolve();
    await flushPromises();

    expect(mocks.loadProposals).not.toHaveBeenCalled();
    expect(mocks.removeSessionProposal).not.toHaveBeenCalled();
    expect(mocks.upsertSessionProposal).toHaveBeenCalledWith("session-1", latestProposal);
  });

  it("shows proposal summary, relative time, and task progress instead of change id", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    try {
      const wrapper = mount(ChatProposalPanel, {
        props: {
          proposals: [
            makeProposal("draft", {
              id: "internal-change-id",
              why: "Make proposal cards easier to scan.",
              doneTasks: 2,
              totalTasks: 5,
              date: "2026-07-06T10:00:00.000Z",
            }),
          ],
        },
      });

      expect(wrapper.get('[data-test="chat-proposal-summary"]').text()).toContain(
        "Make proposal cards easier to scan."
      );
      expect(wrapper.get('[data-test="chat-proposal-meta"]').text()).toContain("2 小时前");
      expect(wrapper.get('[data-test="chat-proposal-meta"]').text()).toContain("2/5 tasks");
      expect(wrapper.text()).not.toContain("创建于");
      expect(wrapper.text()).not.toContain("internal-change-id");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps relative time visible and omits empty summary and zero task progress", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    try {
      const wrapper = mount(ChatProposalPanel, {
        props: {
          proposals: [
            makeProposal("draft", {
              why: "",
              totalTasks: 0,
              doneTasks: 0,
              date: "2026-07-06T11:00:00.000Z",
            }),
          ],
        },
      });

      expect(wrapper.find('[data-test="chat-proposal-summary"]').exists()).toBe(false);
      expect(wrapper.get('[data-test="chat-proposal-meta"]').text()).toContain("1 小时前");
      expect(wrapper.get('[data-test="chat-proposal-meta"]').text()).not.toContain("创建于");
      expect(wrapper.get('[data-test="chat-proposal-meta"]').text()).not.toContain("0/0 tasks");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows linked worktree indicator and path when proposal has worktreePath", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [
          makeProposal("draft", {
            worktreeMode: "linked",
            worktreePath: "/tmp/project/.worktrees/change-1",
          }),
        ],
      },
    });

    expect(wrapper.find('[data-test="proposal-worktree-badge"]').exists()).toBe(true);
    expect(
      wrapper.find('[aria-label="Linked worktree: /tmp/project/.worktrees/change-1"]').exists()
    ).toBe(true);
  });

  it("does not show linked worktree indicator for a main-worktree proposal", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft")] },
    });

    expect(wrapper.find('[data-test="proposal-worktree-badge"]').exists()).toBe(false);
  });

  it("does not eagerly synchronize proposal state after sending archive intent", async () => {
    runMetaValue = {
      runId: "run-1",
      proposalRef: { folderId: "folder-b", changeId: "change-1" },
      worktreePath: "/repo-b",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: {
        proposals: [makeProposal("applying", { totalTasks: 2, doneTasks: 2 })],
      },
    });

    await wrapper.get('[data-test="archive-button"]').trigger("click");
    await flushPromises();

    expect(mocks.startArchive).not.toHaveBeenCalled();
    expect(mocks.loadProposals).not.toHaveBeenCalled();
    expect(mocks.removeSessionProposal).not.toHaveBeenCalled();
    expect(mocks.upsertSessionProposal).not.toHaveBeenCalled();
  });
});
