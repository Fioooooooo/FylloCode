import { describe, expect, it } from "vitest";
import {
  assertWorkspaceMemberMutationAllowed,
  assertWorkspaceRestorable,
  getFolderPathRelation,
  validateWorkspaceDefinition,
  validateWorkspaceFolderPaths,
  validateWorkspaceMeta,
  WorkspaceModelError,
} from "@main/domain/workspace/model";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

function workspace(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    version: 2,
    id: "workspace-1",
    name: "Workspace 1",
    kind: "folder",
    isDeleted: false,
    folderIds: ["workspace-1"],
    primaryFolderId: "workspace-1",
    createdAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function folder(id: string, path: string): FolderMeta {
  return { version: 1, id, name: id, path };
}

function expectWorkspaceError(run: () => unknown, code: string): WorkspaceModelError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(WorkspaceModelError);
    expect((error as WorkspaceModelError).code).toBe(code);
    return error as WorkspaceModelError;
  }
  throw new Error(`Expected WorkspaceModelError ${code}`);
}

describe("Workspace domain model", () => {
  it("rejects a seventeenth member before persistence", () => {
    const folderIds = Array.from({ length: 17 }, (_, index) => `folder-${index + 1}`);
    expect(() =>
      validateWorkspaceMeta(
        workspace({ kind: "collection", folderIds, primaryFolderId: folderIds[0] })
      )
    ).toThrowError(WorkspaceModelError);
  });

  it("keeps a single-member Collection Workspace as collection", () => {
    const parsed = validateWorkspaceMeta(
      workspace({
        id: "collection-1",
        kind: "collection",
        folderIds: ["folder-1"],
        primaryFolderId: "folder-1",
      })
    );
    expect(parsed.kind).toBe("collection");
  });

  it("returns a structured repair error for a damaged Folder Workspace", () => {
    try {
      validateWorkspaceMeta(workspace({ folderIds: ["folder-2"] }));
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceModelError);
      expect((error as WorkspaceModelError).code).toBe("WORKSPACE_FOLDER_SHAPE_INVALID");
      expect((error as WorkspaceModelError).details).toMatchObject({ workspaceId: "workspace-1" });
    }
  });

  it("rejects duplicate members and a primary outside the member set", () => {
    expectWorkspaceError(
      () =>
        validateWorkspaceMeta(
          workspace({
            id: "collection-1",
            kind: "collection",
            folderIds: ["folder-1", "folder-1"],
            primaryFolderId: "folder-1",
          })
        ),
      "WORKSPACE_MEMBER_DUPLICATE"
    );

    expectWorkspaceError(
      () =>
        validateWorkspaceMeta(
          workspace({
            id: "collection-1",
            kind: "collection",
            folderIds: ["folder-1"],
            primaryFolderId: "folder-2",
          })
        ),
      "WORKSPACE_PRIMARY_FOLDER_INVALID"
    );
  });

  it("enforces active and deleted tombstone shapes", () => {
    expectWorkspaceError(
      () =>
        validateWorkspaceMeta(
          workspace({ deletedAt: "2026-08-02T01:00:00.000Z", cleanupState: "restorable" })
        ),
      "WORKSPACE_TOMBSTONE_INVALID"
    );

    const tombstone = validateWorkspaceMeta(
      workspace({
        isDeleted: true,
        deletedAt: "2026-08-02T01:00:00.000Z",
        cleanupState: "restorable",
      })
    );
    expect(() => assertWorkspaceRestorable(tombstone)).not.toThrow();
    expectWorkspaceError(
      () => assertWorkspaceRestorable({ ...tombstone, cleanupState: "cleanup-failed" }),
      "WORKSPACE_NOT_RESTORABLE"
    );
  });

  it("rejects duplicate and nested canonical member paths", () => {
    expectWorkspaceError(
      () =>
        validateWorkspaceFolderPaths([folder("folder-1", "/repo"), folder("folder-2", "/repo/")]),
      "WORKSPACE_MEMBER_PATH_DUPLICATE"
    );

    expectWorkspaceError(
      () =>
        validateWorkspaceFolderPaths([
          folder("folder-1", "/repo"),
          folder("folder-2", "/repo/packages/app"),
        ]),
      "WORKSPACE_MEMBER_PATH_NESTED"
    );
  });

  it("rejects member mutation for Folder Workspace", () => {
    expectWorkspaceError(
      () =>
        assertWorkspaceMemberMutationAllowed(
          workspace(),
          ["workspace-1", "folder-2"],
          "workspace-1"
        ),
      "WORKSPACE_MEMBER_MUTATION_FORBIDDEN"
    );
  });

  it("validates Collection definitions and preserves member order", () => {
    expect(() =>
      validateWorkspaceDefinition({
        id: "collection-1",
        name: "Collection",
        kind: "collection",
        folderIds: ["folder-2", "folder-1"],
        primaryFolderId: "folder-1",
      })
    ).not.toThrow();
  });

  it("projects same, ancestor and descendant path relations", () => {
    expect(getFolderPathRelation("/repo", "/repo/")).toBe("same");
    expect(getFolderPathRelation("/repo", "/repo/apps/web")).toBe("ancestor");
    expect(getFolderPathRelation("/repo/apps/web", "/repo")).toBe("descendant");
    expect(getFolderPathRelation("/repo-a", "/repo-b")).toBeNull();
  });
});
