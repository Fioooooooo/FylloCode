export type TaskSource = "local" | "yunxiao" | "github";

export type TaskStatus = "open" | "closed";

export const taskDescriptionFormats = ["plain_text", "markdown", "html"] as const;

export type TaskDescriptionFormat = (typeof taskDescriptionFormats)[number];

export interface TaskDescription {
  format: TaskDescriptionFormat;
  content: string;
}

export interface TaskUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface TaskLabel {
  id: string;
  name: string;
  color?: string;
}

export interface LocalTaskMeta {
  source: "local";
}

export interface YunxiaoTaskMeta {
  source: "yunxiao";
  url?: string;
  key?: string;
  issueType?: "需求" | "任务" | "缺陷";
}

export interface GithubTaskMeta {
  source: "github";
  url?: string;
  repository?: string;
  number?: number;
  issueType?: "issue" | "pull_request";
}

export type TaskSourceMeta = LocalTaskMeta | YunxiaoTaskMeta | GithubTaskMeta;

export interface TaskItem {
  id: string;
  workspaceId: string;
  title: string;
  description: TaskDescription;
  status: TaskStatus;
  source: TaskSource;
  sourceMeta: TaskSourceMeta;
  labels: TaskLabel[];
  assignee?: TaskUser;
  /** Write-once: set only by insight:lineage:createSessionTask when chat creates a local task. */
  originSessionId?: string;
  /** Idempotency key: set when the task is created from a fyllo-action so duplicates can be detected. */
  actionId?: string;
  /** Ordered repository hints. Missing and empty both mean no repository target. */
  targetFolderIds?: string[];
  /** Read projection against current Workspace membership; not persisted. */
  currentTargetFolderIds?: string[];
  /** Read projection preserving removed or otherwise unavailable target IDs; not persisted. */
  staleTargetFolderIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLocalTaskInput {
  title: string;
  description?: TaskDescription;
  targetFolderIds?: string[];
}

export type UpdateTaskInput = Partial<
  Pick<TaskItem, "title" | "description" | "status" | "labels" | "assignee" | "targetFolderIds">
>;

export function normalizeTaskTargetFolderIds(value: readonly string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  return value.filter((folderId) => {
    if (!folderId || seen.has(folderId)) {
      return false;
    }
    seen.add(folderId);
    return true;
  });
}
