import { promises as fs } from "fs";
import { dirname, extname, join } from "path";
import { listFolders, loadFolder, saveFolder } from "@main/infra/storage/folder-store";
import { workspaceDataDir } from "@main/infra/storage/workspace-paths";
import { loadWorkspace, saveWorkspace } from "@main/infra/storage/workspace-store";
import { encodeProjectPath } from "@main/migrations/legacy-project-path";
import { legacyProjectsDir, listLegacyProjects } from "@main/migrations/legacy-project-store";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, SessionWorkspaceSnapshot, WorkspaceMeta } from "@shared/types/workspace";

export const WORKSPACE_CUTOVER_MIGRATION_ID = "20260802_001_project-to-workspace" as const;

export interface WorkspaceCutoverPlanItem {
  legacyProject: LegacyProjectMeta;
  candidateLegacyAppDataKey: string;
  legacySourceDir: string;
  workspace: WorkspaceMeta;
  folder: FolderMeta;
  pathMissing: boolean;
  copyEntries: WorkspaceCutoverCopyEntry[];
}

export type WorkspaceCutoverCopyEntry =
  | { kind: "directory"; relativePath: string }
  | { kind: "file"; relativePath: string; content: Buffer }
  | { kind: "symlink"; relativePath: string; linkTarget: string };

export interface WorkspaceCutoverDependencies {
  listLegacyProjects(): Promise<LegacyProjectMeta[]>;
  loadWorkspace(workspaceId: string): Promise<WorkspaceMeta | null>;
  loadFolder(folderId: string): Promise<FolderMeta | null>;
  listFolders(): Promise<FolderMeta[]>;
  realpath(path: string): Promise<string>;
  legacyProjectsDir(): string;
  workspaceDataDir(workspaceId: string): string;
  saveWorkspace(meta: WorkspaceMeta): Promise<void>;
  saveFolder(meta: FolderMeta): Promise<void>;
}

const defaultDependencies: WorkspaceCutoverDependencies = {
  listLegacyProjects,
  loadWorkspace,
  loadFolder,
  listFolders,
  realpath: (path) => fs.realpath(path),
  legacyProjectsDir,
  workspaceDataDir,
  saveWorkspace,
  saveFolder,
};

export class WorkspaceCutoverPreflightError extends Error {
  constructor(
    message: string,
    public readonly conflicts: Array<Record<string, unknown>>
  ) {
    super(message);
    this.name = "WorkspaceCutoverPreflightError";
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function replaceLegacyScopeIdentity(value: unknown, workspaceId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replaceLegacyScopeIdentity(item, workspaceId));
  }
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "projectId") {
      result.workspaceId = workspaceId;
      continue;
    }
    result[key] = replaceLegacyScopeIdentity(child, workspaceId);
  }
  return result;
}

function removeTaskRepositoryHints(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeTaskRepositoryHints);
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      key === "targetFolderIds" ? [] : [[key, removeTaskRepositoryHints(child)]]
    )
  );
}

function createSessionWorkspaceSnapshot(plan: WorkspaceCutoverPlanItem): SessionWorkspaceSnapshot {
  return {
    workspaceId: plan.workspace.id,
    workspaceKind: "folder",
    primaryFolderId: plan.folder.id,
    folders: [
      {
        folderId: plan.folder.id,
        folderName: plan.folder.name,
        folderPath: plan.folder.path,
      },
    ],
    cwd: plan.folder.path,
    additionalDirectories: [],
  };
}

const WORKSPACE_DATA_ROOTS = new Set([
  "sessions",
  "tasks",
  "workflows",
  "integrations",
  "knowledge",
  "lineage",
  "mcp-events",
  "apply-runs",
]);

function isSessionMetaPath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]/);
  return parts.length === 2 && parts[0] === "sessions" && extname(parts[1]) === ".json";
}

function transformJsonValue(
  value: unknown,
  relativePath: string,
  plan: WorkspaceCutoverPlanItem
): unknown {
  let transformed = replaceLegacyScopeIdentity(value, plan.workspace.id);

  if (relativePath.split(/[\\/]/)[0] === "tasks") {
    transformed = removeTaskRepositoryHints(transformed);
  }

  if (isSessionMetaPath(relativePath) && isRecord(transformed)) {
    transformed = {
      ...transformed,
      workspaceSnapshot: createSessionWorkspaceSnapshot(plan),
    };
  }
  return transformed;
}

function transformJsonContent(
  content: Buffer,
  relativePath: string,
  plan: WorkspaceCutoverPlanItem
): Buffer {
  try {
    const value = JSON.parse(content.toString("utf8")) as unknown;
    return Buffer.from(JSON.stringify(transformJsonValue(value, relativePath, plan), null, 2));
  } catch {
    return content;
  }
}

function transformJsonlContent(
  content: Buffer,
  relativePath: string,
  plan: WorkspaceCutoverPlanItem
): Buffer {
  const source = content.toString("utf8");
  const transformed = source
    .split("\n")
    .map((line) => {
      if (line.length === 0) return line;
      try {
        const value = JSON.parse(line) as unknown;
        return JSON.stringify(transformJsonValue(value, relativePath, plan));
      } catch {
        return line;
      }
    })
    .join("\n");
  return Buffer.from(transformed);
}

function transformFileContent(
  content: Buffer,
  relativePath: string,
  plan: WorkspaceCutoverPlanItem
): Buffer {
  const root = relativePath.split(/[\\/]/)[0];
  if (!WORKSPACE_DATA_ROOTS.has(root)) return content;
  if (relativePath.endsWith(".json")) {
    return transformJsonContent(content, relativePath, plan);
  }
  if (relativePath.endsWith(".jsonl")) {
    return transformJsonlContent(content, relativePath, plan);
  }
  return content;
}

async function pathKind(path: string): Promise<"directory" | "file" | "symlink" | null> {
  try {
    const stats = await fs.lstat(path);
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
    if (stats.isSymbolicLink()) return "symlink";
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function collectCopyEntries(
  sourceDir: string,
  plan: WorkspaceCutoverPlanItem,
  relativeDir = ""
): Promise<WorkspaceCutoverCopyEntry[]> {
  let entries;
  try {
    entries = await fs.readdir(join(sourceDir, relativeDir), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const result: WorkspaceCutoverCopyEntry[] = [];
  for (const entry of entries) {
    const relativePath = join(relativeDir, entry.name);
    if (relativePath === "meta.json") continue;
    const sourcePath = join(sourceDir, relativePath);

    if (entry.isDirectory()) {
      result.push({ kind: "directory", relativePath });
      result.push(...(await collectCopyEntries(sourceDir, plan, relativePath)));
      continue;
    }
    if (entry.isFile()) {
      const content = transformFileContent(await fs.readFile(sourcePath), relativePath, plan);
      result.push({ kind: "file", relativePath, content });
      continue;
    }
    if (entry.isSymbolicLink()) {
      result.push({ kind: "symlink", relativePath, linkTarget: await fs.readlink(sourcePath) });
      continue;
    }
    throw new WorkspaceCutoverPreflightError("Workspace cutover source is unsupported", [
      { type: "source-entry", sourcePath },
    ]);
  }
  return result;
}

function parsedJsonEquivalent(left: Buffer, right: Buffer): boolean {
  try {
    return sameJson(JSON.parse(left.toString("utf8")), JSON.parse(right.toString("utf8")));
  } catch {
    return left.equals(right);
  }
}

function parsedJsonlEquivalent(left: Buffer, right: Buffer): boolean {
  const parse = (content: Buffer): unknown[] | null => {
    try {
      return content
        .toString("utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as unknown);
    } catch {
      return null;
    }
  };
  const leftRecords = parse(left);
  const rightRecords = parse(right);
  return leftRecords && rightRecords ? sameJson(leftRecords, rightRecords) : left.equals(right);
}

async function findCopyConflicts(
  targetDir: string,
  entries: WorkspaceCutoverCopyEntry[]
): Promise<Array<Record<string, unknown>>> {
  const conflicts: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const targetPath = join(targetDir, entry.relativePath);
    const targetKind = await pathKind(targetPath);
    if (targetKind === null) continue;
    if (targetKind !== entry.kind) {
      conflicts.push({
        type: "workspace-data-target-kind",
        relativePath: entry.relativePath,
        expected: entry.kind,
        actual: targetKind,
      });
      continue;
    }
    if (entry.kind === "file") {
      const targetContent = await fs.readFile(targetPath);
      const equivalent = entry.relativePath.endsWith(".json")
        ? parsedJsonEquivalent(entry.content, targetContent)
        : entry.relativePath.endsWith(".jsonl")
          ? parsedJsonlEquivalent(entry.content, targetContent)
          : entry.content.equals(targetContent);
      if (!equivalent) {
        conflicts.push({
          type: "workspace-data-target-content",
          relativePath: entry.relativePath,
        });
      }
    }
    if (entry.kind === "symlink" && (await fs.readlink(targetPath)) !== entry.linkTarget) {
      conflicts.push({
        type: "workspace-data-target-symlink",
        relativePath: entry.relativePath,
      });
    }
  }
  return conflicts;
}

export async function planProjectWorkspaceCutover(
  dependencies: WorkspaceCutoverDependencies = defaultDependencies
): Promise<WorkspaceCutoverPlanItem[]> {
  const legacyProjects = await dependencies.listLegacyProjects();
  const candidateCounts = new Map<string, number>();
  for (const project of legacyProjects) {
    const candidate = encodeProjectPath(project.path);
    candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }

  const canonicalByLegacyId = new Map<string, string>();
  const pathMissingByLegacyId = new Map<string, boolean>();
  await Promise.all(
    legacyProjects.map(async (project) => {
      try {
        canonicalByLegacyId.set(project.id, await dependencies.realpath(project.path));
        pathMissingByLegacyId.set(project.id, false);
      } catch {
        pathMissingByLegacyId.set(project.id, true);
      }
    })
  );

  const conflicts: Array<Record<string, unknown>> = [];
  const legacyProjectsById = new Map<string, LegacyProjectMeta[]>();
  for (const project of legacyProjects) {
    const projects = legacyProjectsById.get(project.id) ?? [];
    projects.push(project);
    legacyProjectsById.set(project.id, projects);
  }
  for (const [projectId, projects] of legacyProjectsById) {
    if (projects.length > 1) {
      conflicts.push({
        type: "legacy-id",
        projectId,
        paths: projects.map((project) => project.path),
      });
    }
  }

  const legacyIdsByCanonicalPath = new Map<string, string[]>();
  for (const project of legacyProjects) {
    const canonicalPath = canonicalByLegacyId.get(project.id);
    if (!canonicalPath) continue;
    const ids = legacyIdsByCanonicalPath.get(canonicalPath) ?? [];
    ids.push(project.id);
    legacyIdsByCanonicalPath.set(canonicalPath, ids);
  }
  for (const [canonicalPath, projectIds] of legacyIdsByCanonicalPath) {
    if (projectIds.length > 1) {
      conflicts.push({ type: "legacy-canonical-path", canonicalPath, projectIds });
    }
  }

  const existingFolders = await dependencies.listFolders();
  const existingFolderByCanonicalPath = new Map<string, FolderMeta>();
  for (const folder of existingFolders) {
    try {
      const canonicalPath = await dependencies.realpath(folder.path);
      const existing = existingFolderByCanonicalPath.get(canonicalPath);
      if (existing && existing.id !== folder.id) {
        conflicts.push({
          type: "folder-registry-canonical-path",
          canonicalPath,
          folderIds: [existing.id, folder.id],
        });
      } else {
        existingFolderByCanonicalPath.set(canonicalPath, folder);
      }
    } catch {
      continue;
    }
  }

  const plans: WorkspaceCutoverPlanItem[] = [];
  for (const project of legacyProjects) {
    const candidateLegacyAppDataKey = encodeProjectPath(project.path);
    const pathMissing = pathMissingByLegacyId.get(project.id) ?? true;
    const folderPath = canonicalByLegacyId.get(project.id) ?? project.path;
    const folder: FolderMeta = {
      version: 1,
      id: project.id,
      name: project.name,
      path: folderPath,
      ...(project.healthScore === undefined ? {} : { healthScore: project.healthScore }),
    };
    const workspace: WorkspaceMeta = {
      version: 2,
      id: project.id,
      name: project.name,
      kind: "folder",
      isDeleted: false,
      ...(candidateCounts.get(candidateLegacyAppDataKey) === 1
        ? { legacyAppDataKey: candidateLegacyAppDataKey }
        : {}),
      folderIds: [project.id],
      primaryFolderId: project.id,
      createdAt: project.createdAt,
      lastOpenedAt: project.lastOpenedAt,
    };

    const canonicalConflict = existingFolderByCanonicalPath.get(folderPath);
    if (canonicalConflict && canonicalConflict.id !== project.id) {
      conflicts.push({
        type: "legacy-folder-registry-canonical-path",
        canonicalPath: folderPath,
        projectId: project.id,
        folderId: canonicalConflict.id,
      });
    }

    const [existingWorkspace, existingFolder] = await Promise.all([
      dependencies.loadWorkspace(project.id),
      dependencies.loadFolder(project.id),
    ]);
    if (existingWorkspace && !sameJson(existingWorkspace, workspace)) {
      conflicts.push({ type: "workspace-target", projectId: project.id });
    }
    if (existingFolder && !sameJson(existingFolder, folder)) {
      conflicts.push({ type: "folder-target", projectId: project.id });
    }

    const plan: WorkspaceCutoverPlanItem = {
      legacyProject: project,
      candidateLegacyAppDataKey,
      legacySourceDir: join(dependencies.legacyProjectsDir(), candidateLegacyAppDataKey),
      workspace,
      folder,
      pathMissing,
      copyEntries: [],
    };
    plan.copyEntries = await collectCopyEntries(plan.legacySourceDir, plan);
    conflicts.push(
      ...(
        await findCopyConflicts(dependencies.workspaceDataDir(workspace.id), plan.copyEntries)
      ).map((conflict) => ({ ...conflict, projectId: project.id }))
    );
    plans.push(plan);
  }

  if (conflicts.length > 0) {
    throw new WorkspaceCutoverPreflightError(
      `Workspace cutover preflight found ${conflicts.length} conflict(s)`,
      conflicts
    );
  }
  return plans;
}

async function targetExists(path: string): Promise<boolean> {
  return (await pathKind(path)) !== null;
}

export async function executeProjectWorkspaceCutover(
  plans: WorkspaceCutoverPlanItem[],
  dependencies: Pick<
    WorkspaceCutoverDependencies,
    "workspaceDataDir" | "saveWorkspace" | "saveFolder"
  > = defaultDependencies
): Promise<void> {
  for (const plan of plans) {
    const targetDir = dependencies.workspaceDataDir(plan.workspace.id);
    await fs.mkdir(targetDir, { recursive: true });

    for (const entry of plan.copyEntries) {
      const targetPath = join(targetDir, entry.relativePath);
      if (entry.kind === "directory") {
        await fs.mkdir(targetPath, { recursive: true });
        continue;
      }
      if (await targetExists(targetPath)) continue;
      await fs.mkdir(dirname(targetPath), { recursive: true });
      if (entry.kind === "file") {
        await fs.writeFile(targetPath, entry.content);
      } else {
        await fs.symlink(entry.linkTarget, targetPath);
      }
    }

    await dependencies.saveFolder(plan.folder);
    await dependencies.saveWorkspace(plan.workspace);
  }
}

export async function migrateProjectWorkspaceCutover(
  dependencies: WorkspaceCutoverDependencies = defaultDependencies
): Promise<void> {
  const plans = await planProjectWorkspaceCutover(dependencies);
  await executeProjectWorkspaceCutover(plans, dependencies);
}

export async function migrate(): Promise<void> {
  await migrateProjectWorkspaceCutover();
}
