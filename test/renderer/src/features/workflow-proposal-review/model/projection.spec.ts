import { describe, expect, it } from "vitest";
import type { WorkflowProposalDetail } from "@shared/types/workflow";
import {
  isProposalActionableStage,
  projectWorkflowProposalDetail,
  workflowProposalActivityStats,
  workflowProposalStatusPresentation,
} from "@renderer/features/workflow-proposal-review";

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
  yaml: "version: 2\nname: Release Workflow\nstages:\n  - id: publish",
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
        kind: "action",
        op: { type: "exec", command: "pnpm publish" },
        confirm: false,
      },
      {
        id: "notify",
        kind: "action",
        op: { type: "webhook", url: "https://example.test/hook", body: "{}" },
        confirm: true,
      },
    ],
  },
};

describe("workflow proposal review projection", () => {
  it("keeps the complete YAML and highlights executable actions without confirmation", () => {
    const projection = projectWorkflowProposalDetail(detail);

    expect(projection.yaml).toBe(detail.yaml);
    expect(projection.mode).toBe("update");
    expect(projection.targetWorkflowId).toBe("workflow-1");
    expect(projection.targetWorkflowName).toBe("Release Workflow");
    expect(projection.stageCount).toBe(3);
    expect(projection.actionableStageCount).toBe(1);
    expect(projection.stages.map((stage) => stage.actionableWithoutConfirmation)).toEqual([
      false,
      true,
      false,
    ]);
    expect(isProposalActionableStage(detail.definition.stages[1])).toBe(true);
    expect(isProposalActionableStage(detail.definition.stages[2])).toBe(false);
  });

  it("preserves independent status and activity projections", () => {
    expect(workflowProposalStatusPresentation("pending")).toMatchObject({
      label: "等待确认",
      icon: expect.stringContaining("i-lucide"),
    });
    expect(
      workflowProposalActivityStats([
        detail,
        { ...detail, proposalId: "proposal-2", status: "confirmed" },
      ])
    ).toEqual({
      total: 2,
      pending: 1,
    });
  });
});
