import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatBackgroundActivityBar from "@renderer/components/chat/ChatBackgroundActivityBar.vue";
import { useSessionStore } from "@renderer/stores/session/session";

const activityMocks = vi.hoisted(() => ({
  workflowList: vi.fn(),
  workflowDetail: vi.fn(),
  proposalList: vi.fn(),
  proposalDetail: vi.fn(),
}));

vi.mock("@renderer/api/automation/workflow-run", () => ({
  workflowRunApi: {
    list: activityMocks.workflowList,
    getDetail: activityMocks.workflowDetail,
    decide: vi.fn(),
    onWake: vi.fn(),
  },
}));

vi.mock("@renderer/api/automation/workflow-proposal", () => ({
  workflowProposalApi: {
    list: activityMocks.proposalList,
    getDetail: activityMocks.proposalDetail,
    confirm: vi.fn(),
    confirmDispatch: vi.fn(),
    cancel: vi.fn(),
    onWake: vi.fn(),
    decisionList: vi.fn(),
    decisionDispatch: vi.fn(),
    onDecisionWake: vi.fn(),
  },
}));

describe("ChatBackgroundActivityBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    activityMocks.workflowList.mockResolvedValue({ ok: true, data: { runs: [] } });
    activityMocks.workflowDetail.mockResolvedValue({ ok: true, data: {} });
    activityMocks.proposalList.mockResolvedValue({ ok: true, data: { proposals: [] } });
    activityMocks.proposalDetail.mockResolvedValue({ ok: true, data: {} });
  });

  it("mounts workflow and spawned activity entries as siblings", () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      {
        id: "parent-1",
        workspaceId: "workspace-1",
        agentId: "agent-1",
        sessionMode: "fyllocode",
        title: "Parent",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: new Date("2026-08-20T00:00:00.000Z"),
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
        messages: [],
      },
    ];
    sessionStore.activeSessionId = "parent-1";

    const wrapper = mount(ChatBackgroundActivityBar, {
      global: {
        stubs: {
          SpawnedSessionActivityEntry: {
            template: '<div data-test="spawned-entry" />',
            props: ["workspaceId", "parentSessionId"],
          },
          WorkflowRunActivityEntry: {
            template: '<div data-test="workflow-entry" />',
            props: ["workspaceId", "parentSessionId"],
          },
          WorkflowProposalActivityEntry: {
            template: '<div data-test="workflow-proposal-entry" />',
            props: ["workspaceId", "parentSessionId"],
          },
        },
      },
    });

    expect(wrapper.find('[data-test="spawned-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="workflow-entry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="workflow-proposal-entry"]').exists()).toBe(true);
  });

  it("keeps Proposal count/status independent from the Run entry", async () => {
    const sessionStore = useSessionStore();
    sessionStore.sessions = [
      {
        id: "parent-1",
        workspaceId: "workspace-1",
        agentId: "agent-1",
        sessionMode: "fyllocode",
        title: "Parent",
        isPinned: false,
        status: "ended",
        turnCount: 0,
        tokenUsage: { used: 0, size: 0 },
        createdAt: new Date("2026-08-20T00:00:00.000Z"),
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
        messages: [],
      },
    ];
    sessionStore.activeSessionId = "parent-1";
    activityMocks.workflowList.mockResolvedValue({
      ok: true,
      data: {
        runs: [
          {
            runId: "run-1",
            workflowId: "workflow-1",
            workflowName: "Release Workflow",
            parentSessionId: "parent-1",
            status: "awaiting_gate_decision",
            currentStageId: "review",
            pendingDecision: { kind: "gate", prompt: "Review output" },
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:01:00.000Z",
          },
        ],
      },
    });
    activityMocks.proposalList.mockResolvedValue({
      ok: true,
      data: {
        proposals: [
          {
            proposalId: "proposal-1",
            workspaceId: "workspace-1",
            parentSessionId: "parent-1",
            mode: "create",
            suggestedPersist: "session",
            status: "pending",
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:01:00.000Z",
          },
        ],
      },
    });

    const wrapper = mount(ChatBackgroundActivityBar, {
      global: {
        stubs: {
          SpawnedSessionActivityEntry: true,
          UPopover: { template: "<div><slot /><slot name='content' /></div>" },
          Popover: { template: "<div><slot /><slot name='content' /></div>" },
          WorkflowRunDetailSlideover: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Workflow 1");
    expect(wrapper.text()).toContain("等待 Gate 决策");
    expect(wrapper.text()).toContain("Workflow 提案 1");
    expect(wrapper.text()).toContain("等待确认");
    expect(wrapper.find('[data-test="workflow-run-activity-trigger"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="workflow-proposal-activity-trigger"]').exists()).toBe(true);
  });
});
