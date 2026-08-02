import { describe, expect, it } from "vitest";
import {
  deleteWorkflowInputSchema,
  listWorkflowsInputSchema,
  saveWorkflowInputSchema,
} from "@shared/ipc/automation/workflow.schemas";

describe("workflow IPC schemas", () => {
  it("requires workspaceId for Workspace page list and mutations", () => {
    expect(listWorkflowsInputSchema.safeParse({}).success).toBe(false);
    expect(saveWorkflowInputSchema.safeParse({ name: "custom", yaml: "" }).success).toBe(false);
    expect(deleteWorkflowInputSchema.safeParse({ name: "custom" }).success).toBe(false);
    expect(listWorkflowsInputSchema.parse({ workspaceId: "workspace-a" })).toEqual({
      workspaceId: "workspace-a",
    });
  });
});
