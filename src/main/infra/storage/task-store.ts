import { promises as fs } from "fs";
import { join } from "path";
import { encodeProjectPath } from "@main/infra/storage/project-paths";
import { getDataSubPath } from "@main/infra/paths";
import type {
  TaskDescription,
  TaskDescriptionFormat,
  TaskItem,
  TaskSource,
  TaskSourceMeta,
  TaskStatus,
} from "@shared/types/task";

interface TaskStoreDocument {
  version: 1;
  tasks: PersistedTaskItem[];
}

type PersistedDate = string;

interface PersistedTaskItem extends Omit<
  TaskItem,
  "createdAt" | "updatedAt" | "sourceMeta" | "labels" | "assignee"
> {
  createdAt: PersistedDate;
  updatedAt: PersistedDate;
  sourceMeta: TaskSourceMeta;
  labels: TaskItem["labels"];
  assignee?: TaskItem["assignee"];
}

const TASK_STORE_VERSION = 1 as const;

export function tasksPath(projectPath: string): string {
  return join(getDataSubPath("projects"), encodeProjectPath(projectPath), "tasks", "tasks.json");
}

function tasksDir(projectPath: string): string {
  return join(getDataSubPath("projects"), encodeProjectPath(projectPath), "tasks");
}

export async function ensureTasksDir(projectPath: string): Promise<void> {
  await fs.mkdir(tasksDir(projectPath), { recursive: true });
}

function isTaskSource(value: unknown): value is TaskSource {
  return value === "local" || value === "yunxiao" || value === "github";
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "open" || value === "closed";
}

function isTaskDescriptionFormat(value: unknown): value is TaskDescriptionFormat {
  return value === "plain_text" || value === "markdown" || value === "html";
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function normalizeSourceMeta(source: TaskSource, sourceMeta: unknown): TaskSourceMeta {
  if (!sourceMeta || typeof sourceMeta !== "object") {
    return { source };
  }

  const meta = sourceMeta as Record<string, unknown>;
  if (!isTaskSource(meta.source)) {
    return { source };
  }

  return { ...meta, source: meta.source } as TaskSourceMeta;
}

function normalizeLabels(value: unknown): TaskItem["labels"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is { id: string; name: string; color?: string } =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { name?: unknown }).name === "string"
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      color: typeof item.color === "string" ? item.color : undefined,
    }));
}

type AssigneeLike = {
  id?: unknown;
  name?: unknown;
  avatarUrl?: unknown;
};

function normalizeAssignee(value: unknown): TaskItem["assignee"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const assignee = value as AssigneeLike;
  if (typeof assignee.id !== "string" || typeof assignee.name !== "string") {
    return undefined;
  }

  return {
    id: assignee.id,
    name: assignee.name,
    avatarUrl: typeof assignee.avatarUrl === "string" ? assignee.avatarUrl : undefined,
  };
}

function normalizeDescription(value: unknown): TaskDescription | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const description = value as { format?: unknown; content?: unknown };
  if (!isTaskDescriptionFormat(description.format) || typeof description.content !== "string") {
    return null;
  }

  return {
    format: description.format,
    content: description.content,
  };
}

function normalizeTaskItem(raw: unknown, fallbackProjectId: string): TaskItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Partial<TaskItem> & {
    createdAt?: unknown;
    updatedAt?: unknown;
    sourceMeta?: unknown;
    labels?: unknown;
    assignee?: unknown;
    status?: unknown;
    source?: unknown;
  };

  if (typeof item.id !== "string" || typeof item.title !== "string") {
    return null;
  }

  const source = isTaskSource(item.source) ? item.source : "local";
  const description = normalizeDescription(item.description);
  if (!description) {
    return null;
  }

  return {
    id: item.id,
    projectId:
      typeof item.projectId === "string" && item.projectId ? item.projectId : fallbackProjectId,
    title: item.title,
    description,
    status: isTaskStatus(item.status) ? item.status : "open",
    source,
    sourceMeta: normalizeSourceMeta(source, item.sourceMeta),
    labels: normalizeLabels(item.labels),
    assignee: normalizeAssignee(item.assignee),
    originSessionId:
      typeof item.originSessionId === "string" && item.originSessionId
        ? item.originSessionId
        : undefined,
    createdAt: toDate(item.createdAt),
    updatedAt: toDate(item.updatedAt),
  };
}

function serializeTaskItem(task: TaskItem): PersistedTaskItem {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function normalizeDocument(raw: unknown, projectPath: string): TaskItem[] {
  const projectId = encodeProjectPath(projectPath);
  const tasks = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { tasks?: unknown }).tasks)
      ? ((raw as { tasks: unknown[] }).tasks as unknown[])
      : [];

  return tasks
    .map((task) => normalizeTaskItem(task, projectId))
    .filter((task): task is TaskItem => task !== null);
}

export async function loadTasks(projectPath: string): Promise<TaskItem[]> {
  try {
    const content = await fs.readFile(tasksPath(projectPath), "utf8");
    return normalizeDocument(JSON.parse(content) as unknown, projectPath);
  } catch {
    return [];
  }
}

export async function saveTasks(projectPath: string, tasks: TaskItem[]): Promise<void> {
  await ensureTasksDir(projectPath);
  const document: TaskStoreDocument = {
    version: TASK_STORE_VERSION,
    tasks: tasks.map((task) => serializeTaskItem(task)),
  };
  await fs.writeFile(tasksPath(projectPath), JSON.stringify(document, null, 2), "utf8");
}
