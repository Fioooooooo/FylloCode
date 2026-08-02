import { describe, expect, it } from "vitest";
import {
  folderMetaSchema,
  workspaceKindSchema,
  workspaceMetaSchema,
  type SessionWorkspaceSnapshot,
} from "@shared/types/workspace";

const baseWorkspace = {
  version: 2 as const,
  id: "workspace-1",
  name: "Workspace 1",
  kind: "folder" as const,
  isDeleted: false,
  folderIds: ["workspace-1"],
  primaryFolderId: "workspace-1",
  createdAt: "2026-08-02T00:00:00.000Z",
  lastOpenedAt: "2026-08-02T00:00:00.000Z",
};

describe("Workspace shared schemas", () => {
  it("accepts only persisted folder and collection kinds", () => {
    expect(workspaceKindSchema.parse("folder")).toBe("folder");
    expect(workspaceKindSchema.parse("collection")).toBe("collection");
    expect(workspaceKindSchema.safeParse("multi-root").success).toBe(false);
  });

  it("accepts versioned Folder metadata", () => {
    expect(
      folderMetaSchema.parse({
        version: 1,
        id: "folder-1",
        name: "Folder 1",
        path: "/work/folder-1",
        healthScore: 95,
      })
    ).toMatchObject({ id: "folder-1", path: "/work/folder-1" });
  });

  it("accepts one through sixteen Workspace members", () => {
    expect(workspaceMetaSchema.safeParse(baseWorkspace).success).toBe(true);

    const folderIds = Array.from({ length: 16 }, (_, index) => `folder-${index + 1}`);
    expect(
      workspaceMetaSchema.safeParse({
        ...baseWorkspace,
        kind: "collection",
        folderIds,
        primaryFolderId: folderIds[0],
      }).success
    ).toBe(true);

    expect(workspaceMetaSchema.safeParse({ ...baseWorkspace, folderIds: [] }).success).toBe(false);
    expect(
      workspaceMetaSchema.safeParse({
        ...baseWorkspace,
        folderIds: [...folderIds, "folder-17"],
      }).success
    ).toBe(false);
  });

  it("validates primary and tombstone field shapes", () => {
    expect(workspaceMetaSchema.safeParse({ ...baseWorkspace, primaryFolderId: "" }).success).toBe(
      false
    );
    expect(
      workspaceMetaSchema.safeParse({
        ...baseWorkspace,
        isDeleted: true,
        deletedAt: "2026-08-02T01:00:00.000Z",
        cleanupState: "restorable",
      }).success
    ).toBe(true);
    expect(
      workspaceMetaSchema.safeParse({ ...baseWorkspace, cleanupState: "expired" }).success
    ).toBe(false);
  });

  it("keeps Folder identity mapped to its path in a Session snapshot", () => {
    const snapshot: SessionWorkspaceSnapshot = {
      workspaceId: "workspace-1",
      workspaceKind: "folder",
      primaryFolderId: "workspace-1",
      folders: [
        {
          folderId: "workspace-1",
          folderName: "Folder 1",
          folderPath: "/work/folder-1",
        },
      ],
      cwd: "/work/folder-1",
      additionalDirectories: [],
    };

    expect(snapshot.folders[0]).toEqual({
      folderId: "workspace-1",
      folderName: "Folder 1",
      folderPath: "/work/folder-1",
    });
  });
});
