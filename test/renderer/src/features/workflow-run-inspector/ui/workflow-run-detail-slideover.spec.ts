import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowRunDetail } from "@shared/types/workflow";
import WorkflowRunDetailSlideover from "@renderer/features/workflow-run-inspector/ui/WorkflowRunDetailSlideover.vue";

const result: WorkflowRunDetail = {
  runId: "run-1",
  workflowId: "workflow-1",
  workflowName: "Release Workflow",
  parentSessionId: "parent-1",
  status: "awaiting_gate_decision",
  currentStageId: "review",
  pendingDecision: { kind: "gate", prompt: "检查 Agent 输出" },
  visitCounts: { review: 1 },
  artifacts: { result: "Agent output" },
  agentSessionState: { sessionId: "workflow-session-1" },
  transcript: "Agent output",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:01:00.000Z",
};

describe("WorkflowRunDetailSlideover", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the pending decision and emits the shared approve/reject action", async () => {
    const wrapper = mount(WorkflowRunDetailSlideover, {
      props: { open: true, loading: false, error: null, result },
      global: {
        stubs: {
          USlideover: {
            template: "<div><slot name='body' /></div>",
            props: ["open", "close", "ui"],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("等待 Gate 决策");
    expect(wrapper.text()).toContain("检查 Agent 输出");
    expect(wrapper.text()).toContain("workflow-session-1");
    expect(wrapper.text()).toContain("Agent output");

    await wrapper.get('[data-test="workflow-run-approve"]').trigger("click");
    await wrapper.get('[data-test="workflow-run-reject"]').trigger("click");
    expect(wrapper.emitted("decide")).toEqual([["approve"], ["reject"]]);
  });

  it("keeps an interrupted Run's transcript and artifact projection visible", () => {
    const wrapper = mount(WorkflowRunDetailSlideover, {
      props: {
        open: true,
        loading: false,
        error: null,
        result: {
          ...result,
          status: "interrupted",
          pendingDecision: undefined,
          error: { code: "APP_RESTARTED", message: "没有可恢复的 live handle" },
        },
      },
      global: {
        stubs: {
          USlideover: { template: "<div><slot name='body' /></div>", props: ["open"] },
        },
      },
    });

    expect(wrapper.text()).toContain("已中断");
    expect(wrapper.text()).toContain("APP_RESTARTED");
    expect(wrapper.text()).toContain("Agent output");
    expect(wrapper.text()).toContain("result");
  });
});
