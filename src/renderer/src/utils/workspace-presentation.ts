import type { IpcErrorInfo } from "@shared/types/ipc";
import type { WorkspaceCleanupState, WorkspaceKind } from "@shared/types/workspace";

export const workspacePresentationTerms = {
  member: "Project",
  primaryMember: "主 Project",
  projectDirectory: "项目目录",
} as const;

export type WorkspaceKindLabel = "Project" | "Workspace";
export type WorkspaceSubjectLabel = WorkspaceKindLabel | "Project 或 Workspace";

export function workspaceKindLabel(kind: WorkspaceKind): WorkspaceKindLabel {
  return kind === "folder" ? "Project" : "Workspace";
}

export function workspaceSubjectLabel(kind?: WorkspaceKind): WorkspaceSubjectLabel {
  return kind ? workspaceKindLabel(kind) : "Project 或 Workspace";
}

export function workspacePrimaryDirectoryLabel(kind?: WorkspaceKind): string {
  if (kind === "folder") return "Project 的项目目录";
  if (kind === "collection") return "Workspace 的主 Project 项目目录";
  return "Project 或 Workspace 的项目目录";
}

export function workspaceCleanupStateLabel(state: WorkspaceCleanupState): string {
  const labels: Record<WorkspaceCleanupState, string> = {
    restorable: "可恢复",
    purging: "正在永久删除…",
    "cleanup-failed": "清理失败",
  };

  return labels[state];
}

export function presentWorkspaceError(
  error: Pick<IpcErrorInfo, "code" | "message"> | unknown,
  kind?: WorkspaceKind
): string {
  const subject = workspaceSubjectLabel(kind);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "WORKSPACE_NOT_FOUND":
      return `${subject} 不存在或已被删除。`;
    case "WORKSPACE_REQUIRED":
      return "请先打开 Project 或 Workspace。";
    case "WORKSPACE_PRIMARY_FOLDER_MISSING":
    case "FOLDER_PATH_UNAVAILABLE":
    case "SESSION_FOLDER_PATH_MISSING":
      return `${workspacePrimaryDirectoryLabel(kind)}不可用，请重新定位后再试。`;
    case "WORKSPACE_DELETED":
      return `${subject} 已在回收站中，请先恢复。`;
    case "WORKSPACE_MEMBER_MUTATION_FORBIDDEN":
      return "Project 不能管理多个成员；如需组合多个 Project，请创建 Workspace。";
    case "WORKSPACE_MEMBER_ACTIVE_REFERENCE":
    case "FOLDER_RELOCATION_ACTIVE_RUNTIME":
      return "该 Project 正在被运行中的任务使用，请停止相关操作后再试。";
    case "WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_REQUIRED":
      return "移除 Project 会影响历史 Session，请确认影响后重试。";
    case "FOLDER_RELOCATION_CONFIRMATION_REQUIRED":
      return "重新定位项目目录会影响历史 Session，请确认影响后重试。";
    case "WORKSPACE_CLEANUP_FAILED":
      return `${subject} 的 FylloCode 数据清理失败，请重试。`;
    case "WORKSPACE_NOT_RESTORABLE":
      return `${subject} 当前无法恢复，只能继续永久删除。`;
    case "WORKSPACE_MEMBER_DUPLICATE":
    case "WORKSPACE_MEMBER_PATH_DUPLICATE":
      return "同一个 Project 不能重复添加到 Workspace。";
    case "WORKSPACE_MEMBER_PATH_NESTED":
      return "Workspace 中的项目目录不能互相包含。";
    case "WORKSPACE_PRIMARY_FOLDER_INVALID":
      return "主 Project 必须属于当前 Workspace。";
    case "FOLDER_CANONICAL_PATH_CONFLICT":
    case "FOLDER_RELOCATION_CONFLICT":
      return "该项目目录已被其他 Project 使用，请选择其他目录。";
    case "FOLDER_NOT_FOUND":
    case "SESSION_FOLDER_REMOVED":
      return "Project 不存在或已不属于当前 Workspace。";
    default:
      return "操作失败，请重试；如果问题持续，请查看日志。";
  }
}
