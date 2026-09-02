import { describe, expect, it } from "vitest";
import {
  getWorkflowPhase1CapabilityIssues,
  preflightWorkflowDefinition,
  WorkflowCapabilityPreflightError,
} from "@main/domain/automation/workflow/preflight";
import type { WorkflowDefinition } from "@shared/types/workflow";

function baseDefinition(): WorkflowDefinition {
  return {
    name: "Phase 1 workflow",
    version: 2,
    requires: [],
    stages: [
      {
        id: "agent",
        kind: "agent",
        context: "fresh",
        prompt: "Inspect {{run.id}}",
        produces: { id: "result", schema: "freeform" },
        gate: { type: "human", prompt: "Review {{run.id}}" },
        next: [{ on: "pass", goto: "action" }],
      },
      {
        id: "action",
        kind: "action",
        op: { type: "exec", command: "true" },
        confirm: false,
        terminal: true,
      },
    ],
  };
}

describe("workflow Phase 1 capability preflight", () => {
  it("accepts the supported empty-requires fresh/freeform/exec/human combination", () => {
    expect(getWorkflowPhase1CapabilityIssues(baseDefinition())).toEqual([]);
    expect(() => preflightWorkflowDefinition(baseDefinition())).not.toThrow();
  });

  it("rejects non-empty requires and non-run template namespaces before execution", () => {
    const definition = baseDefinition();
    definition.requires = ["proposal"];
    const agent = definition.stages[0];
    if (agent.kind !== "agent") throw new Error("fixture agent missing");
    agent.prompt = "Review {{proposal.title}} and {{artifacts.result.value}}";

    const issues = getWorkflowPhase1CapabilityIssues(definition);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "WORKFLOW_CONTEXT_UNSUPPORTED",
          feature: "requires",
          field: "requires",
          refs: ["proposal"],
        }),
        expect.objectContaining({
          code: "WORKFLOW_CONTEXT_UNSUPPORTED",
          feature: "template-namespace",
          stageId: "agent",
          refs: ["proposal", "{{proposal.title}}"],
        }),
        expect.objectContaining({
          code: "WORKFLOW_CONTEXT_UNSUPPORTED",
          feature: "template-namespace",
          stageId: "agent",
          refs: ["artifacts", "{{artifacts.result.value}}"],
        }),
      ])
    );
    expect(() => preflightWorkflowDefinition(definition)).toThrow(WorkflowCapabilityPreflightError);
  });

  it("rejects every definition feature outside the Phase 1 execution profile with locations", () => {
    const definition = baseDefinition();
    const agent = definition.stages[0];
    if (agent.kind !== "agent") throw new Error("fixture agent missing");
    agent.context = "inherit";
    agent.produces.schema = "verdict";
    agent.gate = { type: "expr", expr: "artifacts.result.value == 1" };
    agent.mcp = ["fyllo-workflow"];
    definition.stages.push(
      {
        id: "wait",
        kind: "wait",
        for: "manual",
        next: [{ on: "signal", goto: "action" }],
      },
      {
        id: "structured-action",
        kind: "action",
        op: { type: "git.commit", message: "commit" },
        retry: { max: 2, backoffMs: 10 },
        idempotencyKey: "commit-{{run.id}}",
        terminal: true,
      }
    );

    const issues = getWorkflowPhase1CapabilityIssues(definition);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "WORKFLOW_CONTEXT_UNSUPPORTED",
          feature: "context.inherit",
          stageId: "agent",
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "structured-artifact",
          stageId: "agent",
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "gate.expr",
          stageId: "agent",
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "mcp-allowlist",
          stageId: "agent",
          refs: ["fyllo-workflow"],
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "wait",
          stageId: "wait",
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "action-op.git.commit",
          stageId: "structured-action",
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "retry",
          stageId: "structured-action",
        }),
        expect.objectContaining({
          code: "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
          feature: "idempotencyKey",
          stageId: "structured-action",
        }),
      ])
    );
    expect(() => preflightWorkflowDefinition(definition)).toThrow(WorkflowCapabilityPreflightError);
  });
});
