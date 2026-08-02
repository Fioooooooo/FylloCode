import { promises as fs } from "fs";
import { dirname } from "path";
import { repositoryLineageIndexPath } from "@main/infra/storage/workspace-paths";
import type { RepositoryLineageIndex, RepositoryLineageRelation } from "@shared/types/lineage";

type JsonRecord = Record<string, unknown>;

export type RepositoryLineageObject =
  { kind: "proposal"; changeId: string } | { kind: "commit"; commitHash: string };

export interface AppendRepositoryLineageRelationResult {
  changed: boolean;
  index: RepositoryLineageIndex;
}

export class RepositoryLineageOriginConflictError extends Error {
  readonly code = "REPOSITORY_LINEAGE_ORIGIN_CONFLICT";

  constructor(readonly existing: RepositoryLineageRelation) {
    super("Repository object already has a different lineage origin");
    this.name = "RepositoryLineageOriginConflictError";
  }
}

const mutationQueues = new Map<string, Promise<void>>();
let tempWriteCounter = 0;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function normalizeRelation(value: unknown): RepositoryLineageRelation | null {
  if (
    !isRecord(value) ||
    typeof value.workspaceId !== "string" ||
    value.workspaceId.length === 0 ||
    typeof value.subjectId !== "string" ||
    value.subjectId.length === 0 ||
    (value.relation !== "origin" && value.relation !== "reference") ||
    typeof value.linkedAt !== "string" ||
    value.linkedAt.length === 0
  ) {
    return null;
  }

  return {
    workspaceId: value.workspaceId,
    subjectId: value.subjectId,
    relation: value.relation,
    linkedAt: value.linkedAt,
  };
}

function normalizeRelationMap(value: unknown): Record<string, RepositoryLineageRelation[]> | null {
  if (!isRecord(value)) {
    return null;
  }

  const result: Record<string, RepositoryLineageRelation[]> = {};
  for (const [key, relations] of Object.entries(value)) {
    if (!key || !Array.isArray(relations)) {
      return null;
    }
    const normalized = relations.map(normalizeRelation);
    if (normalized.some((relation) => relation === null)) {
      return null;
    }
    result[key] = normalized as RepositoryLineageRelation[];
  }
  return result;
}

function normalizeIndex(value: unknown): RepositoryLineageIndex | null {
  if (!isRecord(value) || value.version !== 2 || typeof value.updatedAt !== "string") {
    return null;
  }
  const proposals = normalizeRelationMap(value.proposals);
  const commits = normalizeRelationMap(value.commits);
  if (!proposals || !commits) {
    return null;
  }
  return { version: 2, proposals, commits, updatedAt: value.updatedAt };
}

function emptyIndex(updatedAt = new Date(0).toISOString()): RepositoryLineageIndex {
  return { version: 2, proposals: {}, commits: {}, updatedAt };
}

async function readIndexFile(filePath: string): Promise<RepositoryLineageIndex> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    const index = normalizeIndex(parsed);
    if (!index) {
      throw new TypeError("repository lineage index does not match version 2 schema");
    }
    return index;
  } catch (error) {
    if (isEnoent(error)) {
      return emptyIndex();
    }
    throw error;
  }
}

async function withMutationLock<T>(filePath: string, mutation: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  mutationQueues.set(filePath, queued);

  await previous.catch(() => undefined);
  try {
    return await mutation();
  } finally {
    release();
    if (mutationQueues.get(filePath) === queued) {
      mutationQueues.delete(filePath);
    }
  }
}

async function writeIndexFile(filePath: string, index: RepositoryLineageIndex): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${tempWriteCounter}.tmp`;
  tempWriteCounter += 1;
  try {
    await fs.writeFile(tempPath, JSON.stringify(index, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function objectBucket(
  index: RepositoryLineageIndex,
  object: RepositoryLineageObject
): { map: Record<string, RepositoryLineageRelation[]>; key: string } {
  if (object.kind === "proposal") {
    if (!object.changeId) throw new TypeError("changeId is required");
    return { map: index.proposals, key: object.changeId };
  }
  if (!object.commitHash) throw new TypeError("commitHash is required");
  return { map: index.commits, key: object.commitHash };
}

function sameRelation(left: RepositoryLineageRelation, right: RepositoryLineageRelation): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.subjectId === right.subjectId &&
    left.relation === right.relation
  );
}

export async function readRepositoryLineageIndex(
  folderId: string
): Promise<RepositoryLineageIndex> {
  return readIndexFile(repositoryLineageIndexPath(folderId));
}

export async function appendRepositoryLineageRelation(
  folderId: string,
  object: RepositoryLineageObject,
  relation: RepositoryLineageRelation
): Promise<AppendRepositoryLineageRelationResult> {
  const normalizedRelation = normalizeRelation(relation);
  if (!normalizedRelation) {
    throw new TypeError("repository lineage relation is invalid");
  }

  const filePath = repositoryLineageIndexPath(folderId);
  return withMutationLock(filePath, async () => {
    const index = await readIndexFile(filePath);
    const { map, key } = objectBucket(index, object);
    const relations = map[key] ?? [];

    if (relations.some((item) => sameRelation(item, normalizedRelation))) {
      return { changed: false, index };
    }

    if (normalizedRelation.relation === "origin") {
      const existingOrigin = relations.find((item) => item.relation === "origin");
      if (existingOrigin) {
        throw new RepositoryLineageOriginConflictError(existingOrigin);
      }
    }

    const next: RepositoryLineageIndex = {
      ...index,
      [object.kind === "proposal" ? "proposals" : "commits"]: {
        ...(object.kind === "proposal" ? index.proposals : index.commits),
        [key]: [...relations, normalizedRelation],
      },
      updatedAt: normalizedRelation.linkedAt,
    };
    await writeIndexFile(filePath, next);
    return { changed: true, index: next };
  });
}
