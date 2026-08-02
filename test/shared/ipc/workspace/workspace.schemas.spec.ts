import { describe, expect, it } from "vitest";
import {
  createCollectionWorkspaceInputSchema,
  relocateFolderInputSchema,
  updateWorkspaceDefinitionInputSchema,
  updateWorkspaceInputSchema,
} from "@shared/ipc/workspace/workspace.schemas";

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

  it("enforces Collection membership limits and confirmation flags", () => {
    const folderIds = Array.from({ length: 16 }, (_, index) => `folder-${index}`);
    expect(
      createCollectionWorkspaceInputSchema.safeParse({
        name: "Collection",
        folderIds,
        primaryFolderId: folderIds[0],
      }).success
    ).toBe(true);
    expect(
      createCollectionWorkspaceInputSchema.safeParse({
        name: "Collection",
        folderIds: [...folderIds, "folder-17"],
        primaryFolderId: folderIds[0],
      }).success
    ).toBe(false);
    expect(
      updateWorkspaceDefinitionInputSchema.parse({
        workspaceId: "workspace-1",
        confirmHistoricalSessions: true,
      })
    ).toMatchObject({ confirmHistoricalSessions: true });
  });

  it("rejects renderer-provided relocation paths and legacy cleanup keys", () => {
    expect(
      relocateFolderInputSchema.safeParse({ folderId: "folder-1", path: "/renderer/path" }).success
    ).toBe(false);
    expect(
      updateWorkspaceDefinitionInputSchema.safeParse({
        workspaceId: "workspace-1",
        legacyAppDataKey: "legacy",
      }).success
    ).toBe(false);
  });
});
