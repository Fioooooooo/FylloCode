import { describe, expect, it } from "vitest";
import { updateWorkspaceInputSchema } from "@shared/ipc/workspace/workspace.schemas";

describe("Workspace schemas", () => {
  it("accepts Workspace name and Folder health updates", () => {
    expect(
      updateWorkspaceInputSchema.parse({
        id: "workspace-1",
        patch: { name: "Renamed", healthScore: 75 },
      })
    ).toEqual({ id: "workspace-1", patch: { name: "Renamed", healthScore: 75 } });
  });

  it("does not accept legacy path or Project identity fields", () => {
    expect(
      updateWorkspaceInputSchema.safeParse({
        id: "workspace-1",
        patch: { path: "/legacy/path" },
      }).success
    ).toBe(false);
    expect(
      updateWorkspaceInputSchema.safeParse({
        projectId: "legacy-project",
        patch: { name: "Legacy" },
      }).success
    ).toBe(false);
  });
});
