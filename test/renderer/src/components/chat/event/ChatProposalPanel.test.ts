import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChatProposalPanel from "@renderer/components/chat/event/ChatProposalPanel.vue";
import type { ApplyRunMeta, ProposalMeta } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  startRun: vi.fn(),
  startArchive: vi.fn(),
  fetchTemplates: vi.fn(),
  upsertSessionProposal: vi.fn(),
}));

let runMetaValue: ApplyRunMeta | null = null;
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
    startRun: mocks.startRun,
    startArchive: mocks.startArchive,
  }),
  useSessionStore: () => ({
    activeSession: { id: "session-1" },
    upsertSessionProposal: mocks.upsertSessionProposal,
  }),
}));

function makeProposal(status: ProposalMeta["status"]): ProposalMeta {
  return {
    id: "change-1",
    title: "Test Proposal",
    status,
    why: "",
    totalTasks: 0,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-06-18",
  };
}

describe("ChatProposalPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    runMetaValue = null;
    customTemplatesValue = [{ id: "wf-1", name: "Standard Workflow" }];
    isLoadingValue = false;
  });

  it("shows start apply button for draft proposals", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("draft")] },
    });

    expect(wrapper.find('[data-test="start-apply-button"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("开始实现");
  });

  it("does not show archive button while applying is not done", () => {
    const wrapper = mount(ChatProposalPanel, {
      props: { proposals: [makeProposal("applying")] },
    });

    expect(wrapper.find('[data-test="archive-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="view-detail-button"]').exists()).toBe(true);
  });

  it("shows archive button when applying run is done", () => {
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
    expect(wrapper.text()).toContain("归档");
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

    expect(mocks.startArchive).toHaveBeenCalledWith("project-1", "change-1");
  });
});
