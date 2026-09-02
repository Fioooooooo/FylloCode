import { mount } from "@vue/test-utils";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowRunSummary } from "@shared/types/workflow";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getDetail: vi.fn(),
  decide: vi.fn(),
  onWake: vi.fn(),
}));

vi.mock("@renderer/api/automation/workflow-run", () => ({
  workflowRunApi: {
    list: mocks.list,
    getDetail: mocks.getDetail,
    decide: mocks.decide,
    onWake: mocks.onWake,
  },
}));

import { useWorkflowRunStore } from "@renderer/stores/automation/workflow-run";
import WorkflowRunActivityEntry from "@renderer/features/workflow-run-inspector/ui/WorkflowRunActivityEntry.vue";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };

function run(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    runId: "run-1",
    workflowId: "workflow-1",
    workflowName: "Release Workflow",
    parentSessionId: owner.parentSessionId,
    status: "awaiting_action_confirmation",
    currentStageId: "publish",
    pendingDecision: { kind: "action", prompt: "确认执行 publish" },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:01:00.000Z",
    ...overrides,
  };
}

describe("WorkflowRunActivityEntry", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.list.mockReturnValue(new Promise(() => undefined));
    mocks.getDetail.mockResolvedValue({
      ok: true,
      data: { ...run(), visitCounts: {}, artifacts: {} },
    });
  });

  it("renders an independent workflow activity entry and opens the Run detail", async () => {
    const store = useWorkflowRunStore();
    store.lists = new Map([
      ["workspace-1\0parent-1", { runs: [run()], loading: false, error: null }],
    ]);
    const wrapper = mount(WorkflowRunActivityEntry, {
      props: owner,
      global: {
        plugins: [getActivePinia()!],
        stubs: {
          UPopover: { template: "<div><slot /><slot name='content' /></div>" },
          Popover: { template: "<div><slot /><slot name='content' /></div>" },
          WorkflowRunDetailSlideover: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Workflow 1");
    expect(wrapper.text()).toContain("Release Workflow");
    expect(wrapper.text()).toContain("等待 Action 确认");
    expect(wrapper.get('[data-test="workflow-run-activity-trigger"]').attributes("data-icon")).toBe(
      "i-lucide-workflow"
    );

    await wrapper.get('[data-test="workflow-run-activity-list"] button').trigger("click");
    expect(mocks.getDetail).toHaveBeenCalledWith({ ...owner, runId: "run-1" });
  });

  it("keeps terminal Runs visible in the same independent list", () => {
    const store = useWorkflowRunStore();
    store.lists = new Map([
      [
        "workspace-1\0parent-1",
        {
          runs: [run({ status: "succeeded", pendingDecision: undefined })],
          loading: false,
          error: null,
        },
      ],
    ]);
    const wrapper = mount(WorkflowRunActivityEntry, {
      props: owner,
      global: {
        plugins: [getActivePinia()!],
        stubs: {
          UPopover: { template: "<div><slot /><slot name='content' /></div>" },
          Popover: { template: "<div><slot /><slot name='content' /></div>" },
          WorkflowRunDetailSlideover: true,
        },
      },
    });

    expect(wrapper.text()).toContain("已成功");
    expect(wrapper.text()).toContain("Release Workflow");
  });
});
