import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
  LineageOrigin,
  LineageSessionLink,
  RepositoryLineageIndex,
  RepositoryLineageRelation,
  Subject,
} from "@shared/types/lineage";
import type { ProposalStatus } from "@shared/types/proposal";
import { projectRelativePathSchema } from "@shared/schemas/knowledge";
import { getWorkspaceDataDir } from "../../../shared/env";
import { getWorkspaceContext } from "../../../shared/workspace-context";
import { resolveFolder, validateWorktree } from "../../../shared/workspace-resolver";
import { runGit } from "./git";

export type LineageTaskDto = {
  ref: string;
  title: string;
  description: string;
  source: string;
  url: string | null;
};

export type LineageProposalDto = {
  folderId: string;
  changeId: string;
  createdAt: string;
  commitHash: string | null;
  status: "completed" | "applying" | "pending";
  proposalPath: string | null;
};

export type LineagePlanDto = { slug: string; createdAt: string };
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

export type LineageTraceDto = Partial<Omit<LineageResponseDto, "origin">> & {
  folderId: string;
  worktreePath: string;
  object: { kind: "proposal"; changeId: string } | { kind: "commit"; commitHash: string };
  origin: RepositoryLineageRelation | null;
  references: RepositoryLineageRelation[];
  subjects: Array<{ relation: RepositoryLineageRelation; lineage: LineageResponseDto }>;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function repositoryIndexPath(folderId: string): string {
  const appDataRoot = dirname(dirname(getWorkspaceDataDir()));
  return join(appDataRoot, "workspace-folders", folderId, "lineage", "index.json");
}

async function readRepositoryIndex(folderId: string): Promise<RepositoryLineageIndex | null> {
  try {
    const value = JSON.parse(await readFile(repositoryIndexPath(folderId), "utf8")) as unknown;
    if (
      !isRecord(value) ||
      value.version !== 2 ||
      !isRecord(value.proposals) ||
      !isRecord(value.commits)
    ) {
      return null;
    }
    return value as unknown as RepositoryLineageIndex;
  } catch {
    return null;
  }
}

function isSubject(value: unknown): value is Subject {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.origin === "task" || value.origin === "chat") &&
    Array.isArray(value.links) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

async function readActiveWorkspaceSubject(subjectId: string): Promise<Subject | null> {
  try {
    const value = JSON.parse(
      await readFile(
        join(getWorkspaceDataDir(), "lineage", "subjects", `${subjectId}.json`),
        "utf8"
      )
    ) as unknown;
    return isSubject(value) ? value : null;
  } catch {
    return null;
  }
}

function stripArchivePrefix(name: string): string {
  return name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

async function findArchiveDir(repositoryPath: string, changeId: string): Promise<string | null> {
  const root = join(repositoryPath, "openspec", "changes", "archive");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const entry = entries.find(
      (candidate) => candidate.isDirectory() && stripArchivePrefix(candidate.name) === changeId
    );
    return entry ? join(root, entry.name) : null;
  } catch {
    return null;
  }
}

async function proposalLocation(folderId: string, changeId: string) {
  let repositoryPath: string;
  try {
    repositoryPath = resolveFolder(folderId).folderPath;
  } catch {
    return { status: null as ProposalStatus | null, proposalPath: null as string | null };
  }
  const activePath = join(repositoryPath, "openspec", "changes", changeId);
  try {
    const content = await readFile(join(activePath, ".openspec.yaml"), "utf8");
    const status = content.match(/^\s*status:\s*(creating|draft|applying|archived)\s*$/m)?.[1];
    return { status: (status as ProposalStatus | undefined) ?? null, proposalPath: activePath };
  } catch {
    const archived = await findArchiveDir(repositoryPath, changeId);
    return {
      status: archived ? ("archived" as const) : null,
      proposalPath: archived,
    };
  }
}

function status(raw: ProposalStatus | null): LineageProposalDto["status"] {
  return raw === "archived" ? "completed" : raw === "applying" ? "applying" : "pending";
}

function taskDto(task: Subject["task"]): LineageTaskDto | null {
  if (!task) return null;
  const meta = task.snapshot.sourceMeta;
  return {
    ref: task.ref,
    title: task.snapshot.title,
    description: task.snapshot.description.content,
    source: task.snapshot.source,
    url: meta && "url" in meta && typeof meta.url === "string" ? meta.url : null,
  };
}

async function proposalDto(
  proposal: LineageSessionLink["proposals"][number]
): Promise<LineageProposalDto> {
  const location = await proposalLocation(proposal.folderId, proposal.changeId);
  return {
    folderId: proposal.folderId,
    changeId: proposal.changeId,
    createdAt: proposal.createdAt,
    commitHash: proposal.commitHash ?? null,
    status: status(location.status),
    proposalPath: location.proposalPath,
  };
}

async function projectSubject(subject: Subject): Promise<LineageResponseDto> {
  return {
    subjectId: subject.id,
    origin: subject.origin,
    task: taskDto(subject.task),
    sessions: await Promise.all(
      subject.links.map(async (link) => ({
        sessionId: link.sessionId,
        createdAt: link.createdAt,
        proposals: await Promise.all(link.proposals.map(proposalDto)),
        plans: (link.plans ?? []).map((plan) => ({ slug: plan.slug, createdAt: plan.createdAt })),
      }))
    ),
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

async function resolveTarget(folderId: string, worktreePath?: string): Promise<string> {
  const folder = resolveFolder(folderId);
  return worktreePath ? validateWorktree(folderId, worktreePath) : realpath(folder.folderPath);
}

async function traceRelations(
  folderId: string,
  worktreePath: string,
  object: LineageTraceDto["object"],
  relations: RepositoryLineageRelation[]
): Promise<LineageTraceDto> {
  const origin = relations.find((relation) => relation.relation === "origin") ?? null;
  const references = relations.filter((relation) => relation.relation === "reference");
  const activeWorkspaceId = getWorkspaceContext().workspaceId;
  const subjects: LineageTraceDto["subjects"] = [];
  for (const relation of relations) {
    if (relation.workspaceId !== activeWorkspaceId) continue;
    const subject = await readActiveWorkspaceSubject(relation.subjectId);
    if (subject) subjects.push({ relation, lineage: await projectSubject(subject) });
  }
  const activeLineage = subjects[0]?.lineage;
  const compatibilityProjection = activeLineage
    ? {
        subjectId: activeLineage.subjectId,
        task: activeLineage.task,
        sessions: activeLineage.sessions,
        createdAt: activeLineage.createdAt,
        updatedAt: activeLineage.updatedAt,
      }
    : {};
  return {
    ...compatibilityProjection,
    folderId,
    worktreePath,
    object,
    origin,
    references,
    subjects,
    warnings: origin ? [] : ["Repository lineage origin is unavailable"],
  };
}

export async function traceLineageByProposal(
  folderId: string,
  changeId: string,
  requestedWorktreePath?: string
): Promise<LineageTraceDto> {
  const worktreePath = await resolveTarget(folderId, requestedWorktreePath);
  const index = await readRepositoryIndex(folderId);
  return traceRelations(
    folderId,
    worktreePath,
    { kind: "proposal", changeId },
    index?.proposals[changeId] ?? []
  );
}

export async function traceLineageByCommit(
  folderId: string,
  commitHash: string,
  requestedWorktreePath?: string
): Promise<LineageTraceDto> {
  const worktreePath = await resolveTarget(folderId, requestedWorktreePath);
  const index = await readRepositoryIndex(folderId);
  return traceRelations(
    folderId,
    worktreePath,
    { kind: "commit", commitHash },
    index?.commits[commitHash] ?? []
  );
}

export async function traceLineageByFile(
  folderId: string,
  filePath: string,
  lineRange?: string,
  requestedWorktreePath?: string
): Promise<LineageTraceDto[]> {
  const worktreePath = await resolveTarget(folderId, requestedWorktreePath);
  const parsedPath = projectRelativePathSchema.parse(filePath);
  const canonicalRoot = await realpath(worktreePath);
  const canonicalFile = await realpath(resolve(canonicalRoot, parsedPath));
  const relativePath = relative(canonicalRoot, canonicalFile).replace(/\\/g, "/");
  if (!relativePath || relativePath === ".." || relativePath.startsWith("../")) {
    const error = new Error("filePath escapes the resolved worktree");
    error.name = "InvalidTargetPath";
    throw error;
  }
  const args = lineRange
    ? ["log", "--format=%H", "-L", `${lineRange}:${relativePath}`]
    : ["log", "--format=%H", "--", relativePath];
  const hashes = (await runGit(canonicalRoot, args))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/.test(line));
  const index = await readRepositoryIndex(folderId);
  const results: LineageTraceDto[] = [];
  for (const hash of [...new Set(hashes)]) {
    const relations = index?.commits[hash] ?? [];
    if (relations.length === 0) continue;
    results.push(
      await traceRelations(folderId, canonicalRoot, { kind: "commit", commitHash: hash }, relations)
    );
  }
  return results;
}
