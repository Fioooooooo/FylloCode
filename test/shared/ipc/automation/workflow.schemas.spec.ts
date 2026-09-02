import { describe, expect, it } from "vitest";
import {
  deleteWorkflowInputSchema,
  listWorkflowsInputSchema,
  saveWorkflowInputSchema,
} from "@shared/ipc/automation/workflow.schemas";
import {
  decideWorkflowRunInputSchema,
  getWorkflowRunDetailInputSchema,
  listWorkflowRunsInputSchema,
  workflowRunWakePayloadSchema,
} from "@shared/ipc/automation/workflow-run.schemas";

describe("workflow IPC schemas", () => {
  it("uses workflowId and accepts only YAML for definition mutations", () => {
    expect(listWorkflowsInputSchema.safeParse({}).success).toBe(false);
    expect(saveWorkflowInputSchema.safeParse({ yaml: "name: custom" }).success).toBe(false);
    expect(deleteWorkflowInputSchema.safeParse({ name: "custom" }).success).toBe(false);
    expect(listWorkflowsInputSchema.parse({ workspaceId: "workspace-a" })).toEqual({
      workspaceId: "workspace-a",
    });
    expect(
      saveWorkflowInputSchema.parse({ workspaceId: "workspace-a", yaml: "name: custom" })
    ).toEqual({ workspaceId: "workspace-a", yaml: "name: custom" });
    expect(
      saveWorkflowInputSchema.safeParse({
        workspaceId: "workspace-a",
        yaml: "name: custom",
        name: "custom",
      }).success
    ).toBe(false);
    expect(
      deleteWorkflowInputSchema.parse({ workspaceId: "workspace-a", workflowId: "workflow-1" })
    ).toEqual({ workspaceId: "workspace-a", workflowId: "workflow-1" });
  });

  it("keeps workflow-run IPC payloads strict and owner-scoped", () => {
    const owner = { workspaceId: "workspace-a", parentSessionId: "parent-1" };
    expect(listWorkflowRunsInputSchema.parse(owner)).toEqual(owner);
    expect(getWorkflowRunDetailInputSchema.parse({ ...owner, runId: "run-1" })).toEqual({
      ...owner,
      runId: "run-1",
    });
    expect(
      decideWorkflowRunInputSchema.parse({ ...owner, runId: "run-1", decision: "approve" })
    ).toEqual({ ...owner, runId: "run-1", decision: "approve" });
    expect(
      decideWorkflowRunInputSchema.safeParse({
        ...owner,
        runId: "run-1",
        decision: "approve",
        status: "running",
      }).success
    ).toBe(false);
    expect(
      workflowRunWakePayloadSchema.parse({ workspaceId: "workspace-a", runId: "run-1" })
    ).toEqual({
      workspaceId: "workspace-a",
      runId: "run-1",
    });
    expect(
      workflowRunWakePayloadSchema.safeParse({
        workspaceId: "workspace-a",
        runId: "run-1",
        parentSessionId: "parent-1",
      }).success
    ).toBe(false);
  });
});
