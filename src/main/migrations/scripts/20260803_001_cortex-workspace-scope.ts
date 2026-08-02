import { promises as fs } from "fs";
import { dirname, join } from "path";
import { dump, load } from "js-yaml";
import { getDataSubPath } from "@main/infra/paths";
import { lineageCommitKey, lineageProposalKey } from "@shared/types/lineage";
import type {
  LineageIndex,
  RepositoryLineageIndex,
  RepositoryLineageRelation,
} from "@shared/types/lineage";

export const CORTEX_WORKSPACE_SCOPE_MIGRATION_ID = "20260803_001_cortex-workspace-scope" as const;

export interface CortexWorkspaceScopeMigrationDependencies {
  dataPath(name: string): string;
  writeFileAtomically?(filePath: string, content: string): Promise<void>;
}

const defaultDependencies: CortexWorkspaceScopeMigrationDependencies = {
  dataPath: getDataSubPath,
};

type JsonRecord = Record<string, unknown>;

interface MigrationWarning {
  code: string;
  path: string;
  message: string;
}

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\0]/.test(value)
  );
}

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function listDirectories(root: string): Promise<string[]> {
  try {
    return (await fs.readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && isSafeId(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.migration.tmp`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function availableFolderIds(
  workspaceMeta: JsonRecord,
  foldersRoot: string
): Promise<string[]> {
  if (!Array.isArray(workspaceMeta.folderIds)) {
    return [];
  }
  const result: string[] = [];
  for (const folderId of workspaceMeta.folderIds) {
    if (!isSafeId(folderId)) continue;
    const folderMeta = await readJson(join(foldersRoot, folderId, "meta.json"));
    if (!isRecord(folderMeta) || typeof folderMeta.path !== "string") continue;
    try {
      await fs.access(folderMeta.path);
      result.push(folderId);
    } catch {
      // Missing Folder paths are not usable evidence owners.
    }
  }
  return result;
}

function ownerKnowledgeEvidence(
  value: unknown,
  folderId: string
): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const result = ownerKnowledgeEvidence(item, folderId);
      changed ||= result.changed;
      return result.value;
    });
    return { value: items, changed };
  }
  if (!isRecord(value)) return { value, changed: false };

  let changed = false;
  const result: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized = ownerKnowledgeEvidence(child, folderId);
    result[key] = normalized.value;
    changed ||= normalized.changed;
  }

  const needsOwner =
    (result.kind === "file" || result.kind === "package" || result.kind === "commit") &&
    !result.folderId;
  const lineageCommitNeedsOwner =
    result.kind === "lineage" && typeof result.commitHash === "string" && !result.folderId;
  if (needsOwner || lineageCommitNeedsOwner) {
    result.folderId = folderId;
    changed = true;
  }
  return { value: result, changed };
}

async function migrateKnowledge(
  workspaceDir: string,
  uniqueFolderId: string | null,
  warnings: MigrationWarning[],
  writeFileAtomically: (filePath: string, content: string) => Promise<void>
): Promise<void> {
  const knowledgeRoot = join(workspaceDir, "knowledge");
  let files: string[];
  try {
    files = (await fs.readdir(knowledgeRoot)).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return;
  }

  for (const name of files) {
    const filePath = join(knowledgeRoot, name);
    const content = await fs.readFile(filePath, "utf8");
    const match = FRONTMATTER_RE.exec(content);
    if (!match) {
      warnings.push({
        code: "KNOWLEDGE_PARSE_FAILED",
        path: filePath,
        message: "Missing frontmatter",
      });
      continue;
    }
    let frontmatter: unknown;
    try {
      frontmatter = load(match[1] ?? "");
    } catch (error) {
      warnings.push({
        code: "KNOWLEDGE_PARSE_FAILED",
        path: filePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!isRecord(frontmatter)) continue;

    const probe = ownerKnowledgeEvidence(frontmatter, uniqueFolderId ?? "");
    if (!probe.changed) continue;
    if (!uniqueFolderId) {
      warnings.push({
        code: "KNOWLEDGE_OWNER_AMBIGUOUS",
        path: filePath,
        message: "Legacy repository evidence has no uniquely available Folder owner",
      });
      continue;
    }
    const migrated = ownerKnowledgeEvidence(frontmatter, uniqueFolderId);
    const yaml = dump(migrated.value, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd();
    await writeFileAtomically(
      filePath,
      ["---", yaml, "---", content.slice(match[0].length)].join("\n")
    );
  }
}

function emptyWorkspaceIndex(updatedAt: string): LineageIndex {
  return { version: 2, tasks: {}, sessions: {}, proposals: {}, commitHashes: {}, updatedAt };
}

function emptyRepositoryIndex(updatedAt: string): RepositoryLineageIndex {
  return { version: 2, proposals: {}, commits: {}, updatedAt };
}

function relationEquals(
  left: RepositoryLineageRelation,
  right: RepositoryLineageRelation
): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.subjectId === right.subjectId &&
    left.relation === right.relation
  );
}

function appendOrigin(
  index: RepositoryLineageIndex,
  bucket: "proposals" | "commits",
  key: string,
  relation: RepositoryLineageRelation,
  warningPath: string,
  warnings: MigrationWarning[]
): void {
  const relations = index[bucket][key] ?? [];
  if (relations.some((item) => relationEquals(item, relation))) return;
  const origin = relations.find((item) => item.relation === "origin");
  if (origin) {
    warnings.push({
      code: "LINEAGE_ORIGIN_CONFLICT",
      path: warningPath,
      message: `Existing origin ${origin.workspaceId}/${origin.subjectId} was retained`,
    });
    return;
  }
  index[bucket][key] = [...relations, relation];
  index.updatedAt = relation.linkedAt;
}

async function migrateLineage(
  workspaceId: string,
  workspaceDir: string,
  foldersRoot: string,
  warnings: MigrationWarning[],
  writeFileAtomically: (filePath: string, content: string) => Promise<void>
): Promise<void> {
  const subjectsRoot = join(workspaceDir, "lineage", "subjects");
  let files: string[];
  try {
    files = (await fs.readdir(subjectsRoot)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return;
  }

  const workspaceIndex = emptyWorkspaceIndex(new Date(0).toISOString());
  const repositoryIndexes = new Map<string, RepositoryLineageIndex>();

  for (const name of files) {
    const filePath = join(subjectsRoot, name);
    const subject = await readJson(filePath);
    if (!isRecord(subject) || !isSafeId(subject.id) || !Array.isArray(subject.links)) {
      warnings.push({
        code: "LINEAGE_SUBJECT_INVALID",
        path: filePath,
        message: "Subject is invalid",
      });
      continue;
    }
    if (isRecord(subject.task) && typeof subject.task.ref === "string") {
      workspaceIndex.tasks[subject.task.ref] = subject.id;
    }
    const linkedAt =
      typeof subject.updatedAt === "string" ? subject.updatedAt : new Date(0).toISOString();
    workspaceIndex.updatedAt =
      linkedAt > workspaceIndex.updatedAt ? linkedAt : workspaceIndex.updatedAt;

    for (const link of subject.links) {
      if (!isRecord(link) || typeof link.sessionId !== "string") continue;
      workspaceIndex.sessions[link.sessionId] = subject.id;
      if (!Array.isArray(link.proposals)) continue;
      for (const proposal of link.proposals) {
        if (!isRecord(proposal) || typeof proposal.changeId !== "string") continue;
        if (!isSafeId(proposal.folderId)) {
          warnings.push({
            code: "LINEAGE_OWNER_MISSING",
            path: filePath,
            message: `Proposal ${proposal.changeId} has no provable Folder owner`,
          });
          continue;
        }
        const proposalRef = { folderId: proposal.folderId, changeId: proposal.changeId };
        workspaceIndex.proposals[lineageProposalKey(proposalRef)] = subject.id;
        const repositoryIndex =
          repositoryIndexes.get(proposal.folderId) ?? emptyRepositoryIndex(linkedAt);
        repositoryIndexes.set(proposal.folderId, repositoryIndex);
        const origin: RepositoryLineageRelation = {
          workspaceId,
          subjectId: subject.id,
          relation: "origin",
          linkedAt: typeof proposal.createdAt === "string" ? proposal.createdAt : linkedAt,
        };
        appendOrigin(repositoryIndex, "proposals", proposal.changeId, origin, filePath, warnings);
        if (typeof proposal.commitHash === "string" && proposal.commitHash.length > 0) {
          workspaceIndex.commitHashes[lineageCommitKey(proposal.folderId, proposal.commitHash)] =
            subject.id;
          appendOrigin(repositoryIndex, "commits", proposal.commitHash, origin, filePath, warnings);
        }
      }
    }
  }

  await writeFileAtomically(
    join(workspaceDir, "lineage", "index.json"),
    JSON.stringify(workspaceIndex, null, 2)
  );
  for (const [folderId, index] of repositoryIndexes) {
    const filePath = join(foldersRoot, folderId, "lineage", "index.json");
    const existing = await readJson(filePath);
    if (isRecord(existing) && existing.version === 2) {
      const current = existing as unknown as RepositoryLineageIndex;
      for (const [key, relations] of Object.entries(index.proposals)) {
        for (const relation of relations) {
          appendOrigin(current, "proposals", key, relation, filePath, warnings);
        }
      }
      for (const [key, relations] of Object.entries(index.commits)) {
        for (const relation of relations) {
          appendOrigin(current, "commits", key, relation, filePath, warnings);
        }
      }
      await writeFileAtomically(filePath, JSON.stringify(current, null, 2));
    } else {
      await writeFileAtomically(filePath, JSON.stringify(index, null, 2));
    }
  }
}

export async function migrateCortexWorkspaceScope(
  dependencies: CortexWorkspaceScopeMigrationDependencies = defaultDependencies
): Promise<void> {
  const workspacesRoot = dependencies.dataPath("workspaces");
  const foldersRoot = dependencies.dataPath("workspace-folders");
  const writeFileAtomically = dependencies.writeFileAtomically ?? atomicWrite;
  for (const workspaceId of await listDirectories(workspacesRoot)) {
    const workspaceDir = join(workspacesRoot, workspaceId);
    const meta = await readJson(join(workspaceDir, "meta.json"));
    if (!isRecord(meta)) continue;
    const warnings: MigrationWarning[] = [];
    const available = await availableFolderIds(meta, foldersRoot);
    await migrateKnowledge(
      workspaceDir,
      available.length === 1 ? available[0]! : null,
      warnings,
      writeFileAtomically
    );
    await migrateLineage(workspaceId, workspaceDir, foldersRoot, warnings, writeFileAtomically);
    const warningPath = join(workspaceDir, "migration-warnings", "cortex-workspace-scope.json");
    if (warnings.length > 0) {
      await writeFileAtomically(warningPath, JSON.stringify({ version: 1, warnings }, null, 2));
    }
  }
}

export async function migrate(): Promise<void> {
  await migrateCortexWorkspaceScope();
}
