import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatProposalPanel from "@renderer/components/chat/event/ChatProposalPanel.vue";
import type { ApplyRunMeta, ProposalMeta } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
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

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@renderer/stores", () => ({
  useProjectStore: () => ({ currentProject: { id: "project-1" } }),
  useWorkflowStore: () => ({
    get customTemplates() {
      return customTemplatesValue;
    },
    get isLoading() {
      return isLoadingValue;
    },
    fetchTemplates: mocks.fetchTemplates,
  }),
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
    title: "Test Proposal",
    status,
    why: "",
    totalTasks: 0,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-06-18",
    ...overrides,
  };
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
  });

  it("shows start apply and view detail buttons for draft proposals", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft")] },
    });

    expect(wrapper.find('[data-test="start-apply-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("开始实现");
    expect(wrapper.text()).toContain("查看详情");
  });

  it("does not show archive button while applying is not done", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
  });

  it("shows archive-ready badge plus archive and detail buttons when applying run is done", () => {
    runMetaValue = {
      runId: "run-1",
      changeId: "change-1",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("可归档");
    expect(wrapper.text()).toContain("归档");
  });

  it("keeps view detail before other action buttons", () => {
    runMetaValue = {
      runId: "run-1",
      changeId: "change-1",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });
    const actionButtons = wrapper.findAll("button").map((button) => button.text());

    expect(actionButtons.indexOf("查看详情")).toBeLessThan(actionButtons.indexOf("归档"));
  });

  it("shows archiving badge and hides archive button while archive is running", () => {
    isArchivingValue = true;
    runMetaValue = {
      runId: "archive-1",
      changeId: "change-1",
      workflowId: "archive",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "running",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    expect(wrapper.text()).toContain("归档中");
    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
  });

  it("calls startArchive when archive button is clicked", async () => {
    runMetaValue = {
      runId: "run-1",
      changeId: "change-1",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    await wrapper.get('[data-test="archive-button"]').trigger("click");
    await flushPromises();

    expect(mocks.startArchive).toHaveBeenCalledWith("project-1", "change-1");
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

  it("refreshes proposals and replaces the old applying item after archive succeeds", async () => {
    const archivedProposal = makeProposal("archived", { id: "2026-06-22-change-1" });
    proposalStoreProposalsValue = [archivedProposal];
    runMetaValue = {
      runId: "run-1",
      changeId: "change-1",
      workflowId: "wf-1",
      stages: [],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "done",
      startedAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };

    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    await wrapper.get('[data-test="archive-button"]').trigger("click");
    await flushPromises();

    expect(mocks.startArchive).toHaveBeenCalledWith("project-1", "change-1");
    expect(mocks.loadProposals).toHaveBeenCalledOnce();
    expect(mocks.removeSessionProposal).toHaveBeenCalledWith("session-1", "change-1");
    expect(mocks.upsertSessionProposal).toHaveBeenCalledWith("session-1", archivedProposal);
  });
});
