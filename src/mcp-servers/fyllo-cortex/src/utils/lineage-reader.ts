import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  LineageIndex,
  LineageOrigin,
  LineageSessionLink,
  Subject,
} from "@shared/types/lineage";
import type { ProposalStatus } from "@shared/types/proposal";
import { runGit } from "./git";
import { resolveProjectRoot } from "./project-root";

// ── DTO ───────────────────────────────────────────────────────────────────────

export type LineageTaskDto = {
  ref: string;
  title: string;
  description: string;
  source: string;
  url: string | null;
};

export type LineageProposalDto = {
  changeId: string;
  createdAt: string;
  commitHash: string | null;
  status: "completed" | "applying" | "pending";
  proposalPath: string | null;
};

export type LineagePlanDto = {
  slug: string;
  createdAt: string;
};

export type LineageSessionDto = {
  sessionId: string;
  createdAt: string;
  proposals: LineageProposalDto[];
  plans: LineagePlanDto[];
};

export type LineageResponseDto = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskDto | null;
  sessions: LineageSessionDto[];
  createdAt: string;
  updatedAt: string;
};

// ── Errors ──────────────────────────────────────────────────────────────────

export class MissingEnvError extends Error {
  constructor(variable: string) {
    super(`Missing required environment variable: ${variable}`);
    this.name = "MissingEnvError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidOrigin(value: unknown): value is LineageOrigin {
  return value === "task" || value === "chat";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidLineageIndex(value: unknown): value is LineageIndex {
  if (!isPlainObject(value)) return false;
  if (value.version !== 1) return false;
  if (!isPlainObject(value.tasks)) return false;
  if (!isPlainObject(value.sessions)) return false;
  if (!isPlainObject(value.proposals)) return false;
  if (!isPlainObject(value.commitHashes)) return false;
  if (!isNonEmptyString(value.updatedAt)) return false;
  return true;
}

function isValidSubject(value: unknown): value is Subject {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isValidOrigin(value.origin)) return false;
  if (value.task !== null && !isPlainObject(value.task)) return false;
  if (!Array.isArray(value.links)) return false;
  if (!isNonEmptyString(value.createdAt)) return false;
  if (!isNonEmptyString(value.updatedAt)) return false;
  return true;
}

function stripArchivePrefix(dirname: string): string {
  return dirname.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

async function findArchiveDir(projectPath: string, changeId: string): Promise<string | null> {
  const archiveRoot = join(projectPath, "openspec", "changes", "archive");
  try {
    const entries = await readdir(archiveRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && stripArchivePrefix(entry.name) === changeId) {
        return join(archiveRoot, entry.name);
      }
    }
  } catch {
    // archive 目录不存在或无法读取
  }
  return null;
}

// ── Status derivation ───────────────────────────────────────────────────────

async function resolveProposalLocation(
  changeId: string
): Promise<{ status: ProposalStatus | null; proposalPath: string | null }> {
  const projectPath = resolveProjectRoot();

  const mainPath = join(projectPath, "openspec", "changes", changeId, ".openspec.yaml");
  try {
    const content = await readFile(mainPath, "utf-8");
    const match = content.match(/^\s*status:\s*(creating|draft|applying|archived)\s*$/m);
    return {
      status: (match?.[1] as ProposalStatus | undefined) ?? null,
      proposalPath: join(projectPath, "openspec", "changes", changeId),
    };
  } catch {
    // 主目录不存在，继续检查 archive 目录
  }

  const archiveDir = await findArchiveDir(projectPath, changeId);
  if (archiveDir) {
    return {
      status: "archived",
      proposalPath: archiveDir,
    };
  }

  return { status: null, proposalPath: null };
}

function deriveLineageStatus(rawStatus: ProposalStatus | null): LineageProposalDto["status"] {
  switch (rawStatus) {
    case "creating":
    case "draft":
      return "pending";
    case "applying":
      return "applying";
    case "archived":
      return "completed";
    default:
      return "pending";
  }
}

// ── Projection ──────────────────────────────────────────────────────────────

function projectTaskDto(task: Subject["task"]): LineageTaskDto | null {
  if (task === null) return null;

  const snapshot = task.snapshot;
  const sourceMeta = snapshot.sourceMeta;

  let url: string | null = null;
  if (sourceMeta && "url" in sourceMeta && typeof sourceMeta.url === "string") {
    url = sourceMeta.url;
  }

  return {
    ref: task.ref,
    title: snapshot.title,
    description: snapshot.description.content,
    source: snapshot.source,
    url,
  };
}

async function projectProposalDto(
  link: LineageSessionLink["proposals"][number]
): Promise<LineageProposalDto> {
  const { status: rawStatus, proposalPath } = await resolveProposalLocation(link.changeId);
  const status = deriveLineageStatus(rawStatus);

  return {
    changeId: link.changeId,
    createdAt: link.createdAt,
    commitHash: link.commitHash ?? null,
    status,
    proposalPath,
  };
}

async function projectSessionDto(link: LineageSessionLink): Promise<LineageSessionDto> {
  const proposals = await Promise.all(link.proposals.map((p) => projectProposalDto(p)));
  const plans = Array.isArray(link.plans)
    ? link.plans.map((plan) => ({
        slug: plan.slug,
        createdAt: plan.createdAt,
      }))
    : [];

  return {
    sessionId: link.sessionId,
    createdAt: link.createdAt,
    proposals,
    plans,
  };
}

async function projectSubjectDto(subject: Subject): Promise<LineageResponseDto> {
  const sessions = await Promise.all(subject.links.map((link) => projectSessionDto(link)));
  return {
    subjectId: subject.id,
    origin: subject.origin,
    task: projectTaskDto(subject.task),
    sessions,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function readLineageIndex(): Promise<LineageIndex | null> {
  try {
    const dataDir = getRequiredEnv("FYLLO_PROJECT_DATA_DIR");
    const indexPath = join(dataDir, "lineage", "index.json");
    const content = await readFile(indexPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!isValidLineageIndex(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function readSubject(subjectId: string): Promise<Subject | null> {
  try {
    const dataDir = getRequiredEnv("FYLLO_PROJECT_DATA_DIR");
    const subjectPath = join(dataDir, "lineage", "subjects", `${subjectId}.json`);
    const content = await readFile(subjectPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!isValidSubject(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function traceLineageByProposal(changeId: string): Promise<LineageResponseDto | null> {
  const index = await readLineageIndex();
  if (!index) return null;

  const subjectId = index.proposals[changeId];
  if (!subjectId) return null;

  const subject = await readSubject(subjectId);
  if (!subject) return null;

  return projectSubjectDto(subject);
}

export async function traceLineageByCommit(commitHash: string): Promise<LineageResponseDto | null> {
  const index = await readLineageIndex();
  if (!index) return null;

  const subjectId = index.commitHashes[commitHash];
  if (!subjectId) return null;

  const subject = await readSubject(subjectId);
  if (!subject) return null;

  return projectSubjectDto(subject);
}

export async function traceLineageByFile(
  filePath: string,
  lineRange?: string
): Promise<LineageResponseDto[]> {
  const projectPath = resolveProjectRoot();

  const args = lineRange
    ? ["log", "--format=%H", `-L`, `${lineRange}:${filePath}`]
    : ["log", "--format=%H", "--", filePath];
  let stdout: string;
  try {
    stdout = await runGit(projectPath, args);
  } catch {
    return [];
  }

  const commitHashes = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/.test(line));

  if (commitHashes.length === 0) return [];

  const index = await readLineageIndex();
  if (!index) return [];

  const seenSubjects = new Set<string>();
  const results: LineageResponseDto[] = [];

  for (const hash of commitHashes) {
    const subjectId = index.commitHashes[hash];
    if (!subjectId || seenSubjects.has(subjectId)) continue;
    seenSubjects.add(subjectId);

    const subject = await readSubject(subjectId);
    if (!subject) continue;

    results.push(await projectSubjectDto(subject));
  }

  return results;
}
