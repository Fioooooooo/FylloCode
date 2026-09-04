import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { WorkflowProposalDetail } from "@shared/types/workflow";
import WorkflowProposalConfirmCard from "@renderer/features/workflow-proposal-review/ui/WorkflowProposalConfirmCard.vue";

const detail: WorkflowProposalDetail = {
  proposalId: "proposal-1",
  workspaceId: "workspace-1",
  parentSessionId: "parent-1",
  mode: "update",
  targetWorkflowId: "workflow-1",
  targetWorkflowName: "Release Workflow",
  suggestedPersist: "workspace",
  status: "pending",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:01:00.000Z",
  yaml: "version: 2\nname: Release Workflow\nstages:\n  - id: publish\n    kind: action",
  definition: {
    version: 2,
    name: "Release Workflow",
    stages: [
      {
        id: "review",
        kind: "agent",
        prompt: "Review changes",
        produces: { id: "verdict", schema: "verdict" },
      },
      {
        id: "publish",
        name: "Publish package",
        kind: "action",
        op: { type: "exec", command: "pnpm publish" },
        confirm: false,
      },
    ],
  },
};

describe("WorkflowProposalConfirmCard", () => {
  it("shows full YAML, the update target, dangerous action marker, and fixed actions", async () => {
    const wrapper = mount(WorkflowProposalConfirmCard, {
      props: { detail, loading: false, error: null },
      global: {
        stubs: {
          UTimeline: {
            template: '<div v-bind="$attrs" :data-orientation="orientation" />',
            props: ["orientation", "items"],
          },
        },
      },
    });

    expect(wrapper.get('[data-test="workflow-proposal-full-yaml"]').text()).toContain(detail.yaml);
    expect(wrapper.text()).toContain("目标 workflow：Release Workflow");
    expect(wrapper.text()).toContain("workflow-1");
    expect(wrapper.findAll('[data-test="workflow-proposal-auto-execute-badge"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("自动执行，不再确认");
    expect(
      wrapper.get('[data-test="workflow-proposal-timeline"]').attributes("data-orientation")
    ).toBe("vertical");
    expect(wrapper.get('[data-test="workflow-proposal-actions"]').classes()).toContain("shrink-0");
  });

  it("emits cancel and the two explicit persistence choices", async () => {
    const wrapper = mount(WorkflowProposalConfirmCard, {
      props: { detail, loading: false, error: null },
      global: {
        stubs: {
          UTimeline: true,
        },
      },
    });

    await wrapper.get('[data-test="workflow-proposal-cancel"]').trigger("click");
    await wrapper.get('[data-test="workflow-proposal-confirm-session"]').trigger("click");
    await wrapper.get('[data-test="workflow-proposal-confirm-workspace"]').trigger("click");

    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(wrapper.emitted("confirm")).toEqual([["session"], ["workspace"]]);
  });
});
