import { describe, expect, it } from "vitest";
import {
  presentWorkspaceError,
  workspaceCleanupStateLabel,
  workspaceKindIcon,
  workspaceKindLabel,
  workspacePrimaryDirectoryLabel,
  workspacePresentationTerms,
  workspaceSubjectLabel,
} from "@renderer/utils/workspace-presentation";

describe("workspace presentation", () => {
  it("maps internal kinds to stable user-facing subjects", () => {
    expect(workspaceKindLabel("folder")).toBe("Project");
    expect(workspaceKindLabel("collection")).toBe("Workspace");
    expect(workspaceKindIcon("folder")).toBe("i-lucide-folder");
    expect(workspaceKindIcon("collection")).toBe("i-lucide-layout-grid");
    expect(workspaceSubjectLabel("collection")).toBe("Workspace");
    expect(workspaceSubjectLabel()).toBe("Project 或 Workspace");
    expect(workspacePrimaryDirectoryLabel("folder")).toBe("Project 的项目目录");
    expect(workspacePrimaryDirectoryLabel("collection")).toBe("Workspace 的主 Project 项目目录");
  });

  it("keeps a single-member collection presented as a Workspace", () => {
    const collection = { kind: "collection" as const, folderIds: ["folder-1"] };

    expect(collection.folderIds).toHaveLength(1);
    expect(workspaceKindLabel(collection.kind)).toBe("Workspace");
    expect(workspaceKindIcon(collection.kind)).toBe("i-lucide-layout-grid");
  });

  it("provides stable member and path terminology atoms", () => {
    expect(workspacePresentationTerms).toEqual({
      member: "Project",
      primaryMember: "主 Project",
      projectDirectory: "项目目录",
    });
  });

  it("maps cleanup states instead of exposing raw enum values", () => {
    expect(workspaceCleanupStateLabel("restorable")).toBe("可恢复");
    expect(workspaceCleanupStateLabel("purging")).toBe("正在永久删除…");
    expect(workspaceCleanupStateLabel("cleanup-failed")).toBe("清理失败");
  });

  it("projects structured errors with the known subject kind", () => {
    expect(
      presentWorkspaceError(
        {
          code: "WORKSPACE_PRIMARY_FOLDER_MISSING",
          message: "Workspace primary Folder is missing: /repo",
        },
        "folder"
      )
    ).toBe("Project 的项目目录不可用，请重新定位后再试。");

    expect(
      presentWorkspaceError(
        {
          code: "WORKSPACE_DELETED",
          message: "Folder Workspace has been deleted",
        },
        "collection"
      )
    ).toBe("Workspace 已在回收站中，请先恢复。");
  });

  it("does not leak internal messages for unknown errors", () => {
    expect(
      presentWorkspaceError({
        code: "UNKNOWN_ERROR",
        message: "Collection Workspace Folder mutation failed",
      })
    ).toBe("操作失败，请重试；如果问题持续，请查看日志。");
  });
});
