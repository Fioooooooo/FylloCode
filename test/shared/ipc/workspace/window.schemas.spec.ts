import { describe, expect, it } from "vitest";
import { openWorkspaceInputSchema } from "@shared/ipc/workspace/window.schemas";

describe("workspace window schemas", () => {
  it("accepts only workspaceId for opening a Workspace", () => {
    expect(openWorkspaceInputSchema.parse({ workspaceId: "workspace-1" })).toEqual({
      workspaceId: "workspace-1",
    });
    expect(openWorkspaceInputSchema.safeParse({ projectId: "legacy-project" }).success).toBe(false);
    expect(
      openWorkspaceInputSchema.safeParse({
        workspaceId: "workspace-1",
        projectId: "legacy-project",
      }).success
    ).toBe(false);
  });
});
