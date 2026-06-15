import { promises as fs } from "fs";
import { join } from "path";
import { lineageDir, subjectsDir } from "@main/infra/storage/project-paths";
import type {
  LineageIndex,
  LineageOrigin,
  LineageProposalLink,
  LineageSessionLink,
  LineageTaskRef,
  LineageTaskSnapshot,
  Subject,
} from "@shared/types/lineage";
import type {
  TaskDescription,
  TaskDescriptionFormat,
  TaskItem,
  TaskSource,
  TaskSourceMeta,
  TaskStatus,
} from "@shared/types/task";

type JsonRecord = Record<string, unknown>;

const LINEAGE_INDEX_VERSION = 1 as const;
const lineageWriteQueues = new Map<string, Promise<void>>();
let lineageTempWriteCounter = 0;

function subjectPath(projectPath: string, subjectId: string): string {
  return join(subjectsDir(projectPath), `${subjectId}.json`);
}

function indexPath(projectPath: string): string {
  return join(lineageDir(projectPath), "index.json");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLineageOrigin(value: unknown): value is LineageOrigin {
  return value === "task" || value === "chat";
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

function isLineageTaskRef(value: unknown): value is LineageTaskRef {
  if (typeof value !== "string") {
    return false;
  }

  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return false;
  }

  return isTaskSource(value.slice(0, separatorIndex));
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" &&
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0
    )
  );
}

function normalizeDescription(value: unknown): TaskDescription | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isTaskDescriptionFormat(value.format) || typeof value.content !== "string") {
    return null;
  }

  return {
    format: value.format,
    content: value.content,
  };
}

function normalizeSourceMeta(source: TaskSource, sourceMeta: unknown): TaskSourceMeta {
  if (!isRecord(sourceMeta) || !isTaskSource(sourceMeta.source)) {
    return { source };
  }

  return { ...sourceMeta, source: sourceMeta.source } as TaskSourceMeta;
}

function normalizeLabels(value: unknown): TaskItem["labels"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is { id: string; name: string; color?: string } =>
        isRecord(item) && typeof item.id === "string" && typeof item.name === "string"
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      color: typeof item.color === "string" ? item.color : undefined,
    }));
}

function normalizeAssignee(value: unknown): TaskItem["assignee"] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : undefined,
  };
}

function normalizeTaskItem(value: unknown): TaskItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = isTaskSource(value.source) ? value.source : null;
  const status = isTaskStatus(value.status) ? value.status : null;
  const description = normalizeDescription(value.description);
  const createdAt = toDate(value.createdAt);
  const updatedAt = toDate(value.updatedAt);

  if (
    typeof value.id !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.title !== "string" ||
    !source ||
    !status ||
    !description ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id: value.id,
    projectId: value.projectId,
    title: value.title,
    description,
    status,
    source,
    sourceMeta: normalizeSourceMeta(source, value.sourceMeta),
    labels: normalizeLabels(value.labels),
    assignee: normalizeAssignee(value.assignee),
    originSessionId:
      typeof value.originSessionId === "string" && value.originSessionId.length > 0
        ? value.originSessionId
        : undefined,
    createdAt,
    updatedAt,
  };
}

function normalizeTaskSnapshot(value: unknown): LineageTaskSnapshot | null {
  if (!isRecord(value) || !isLineageTaskRef(value.ref) || typeof value.capturedAt !== "string") {
    return null;
  }

  const snapshot = normalizeTaskItem(value.snapshot);
  if (!snapshot) {
    return null;
  }

  return {
    ref: value.ref,
    snapshot,
    capturedAt: value.capturedAt,
  };
}

function normalizeProposalLink(value: unknown): LineageProposalLink | null {
  if (
    !isRecord(value) ||
    typeof value.changeId !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  return {
    changeId: value.changeId,
    createdAt: value.createdAt,
    commitHash:
      typeof value.commitHash === "string" && value.commitHash.length > 0
        ? value.commitHash
        : undefined,
  };
}

function normalizeSessionLink(value: unknown): LineageSessionLink | null {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.proposals)
  ) {
    return null;
  }

  return {
    sessionId: value.sessionId,
    createdAt: value.createdAt,
    proposals: value.proposals
      .map((proposal) => normalizeProposalLink(proposal))
      .filter((proposal): proposal is LineageProposalLink => proposal !== null),
  };
}

function normalizeSubject(value: unknown): Subject | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isLineageOrigin(value.origin) ||
    !Array.isArray(value.links) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const task = value.task === null ? null : normalizeTaskSnapshot(value.task);
  if (value.task !== null && !task) {
    return null;
  }

  return {
    id: value.id,
    origin: value.origin,
    task,
    links: value.links
      .map((link) => normalizeSessionLink(link))
      .filter((link): link is LineageSessionLink => link !== null),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeIndex(value: unknown): LineageIndex | null {
  if (
    !isRecord(value) ||
    value.version !== LINEAGE_INDEX_VERSION ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    version: LINEAGE_INDEX_VERSION,
    tasks: normalizeStringRecord(value.tasks),
    sessions: normalizeStringRecord(value.sessions),
    proposals: normalizeStringRecord(value.proposals),
    commitHashes: normalizeStringRecord(value.commitHashes),
    updatedAt: value.updatedAt,
  };
}

async function withLineageWriteLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = lineageWriteQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  lineageWriteQueues.set(filePath, queued);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (lineageWriteQueues.get(filePath) === queued) {
      lineageWriteQueues.delete(filePath);
    }
  }
}

async function writeLineageFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${lineageTempWriteCounter}.tmp`;
  lineageTempWriteCounter += 1;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function readSubject(projectPath: string, subjectId: string): Promise<Subject | null> {
  const parsed = await readJsonFile(subjectPath(projectPath, subjectId));
  return normalizeSubject(parsed);
}

export async function writeSubject(projectPath: string, subject: Subject): Promise<void> {
  const normalized = normalizeSubject(subject);
  if (!normalized) {
    throw new TypeError("subject must match the lineage subject schema");
  }

  await ensureDir(subjectsDir(projectPath));
  await withLineageWriteLock(subjectPath(projectPath, normalized.id), async () => {
    await writeLineageFile(
      subjectPath(projectPath, normalized.id),
      JSON.stringify(normalized, null, 2)
    );
  });
}

export async function listSubjects(projectPath: string): Promise<Subject[]> {
  try {
    const files = await fs.readdir(subjectsDir(projectPath));
    const subjects: Subject[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const subject = await readSubject(projectPath, file.slice(0, -".json".length));
      if (subject) {
        subjects.push(subject);
      }
    }
    return subjects;
  } catch {
    return [];
  }
}

export async function readIndex(projectPath: string): Promise<LineageIndex | null> {
  const parsed = await readJsonFile(indexPath(projectPath));
  return normalizeIndex(parsed);
}

export async function writeIndex(projectPath: string, index: LineageIndex): Promise<void> {
  const normalized = normalizeIndex(index);
  if (!normalized) {
    throw new TypeError("index must match the lineage index schema");
  }

  await ensureDir(lineageDir(projectPath));
  await withLineageWriteLock(indexPath(projectPath), async () => {
    await writeLineageFile(indexPath(projectPath), JSON.stringify(normalized, null, 2));
  });
}
