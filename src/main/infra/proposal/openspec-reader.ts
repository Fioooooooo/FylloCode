import { promises as fs } from "fs";
import { basename, join, resolve } from "path";
import type { ProposalMeta, ProposalStatus, ProposalWorktreeMode } from "@shared/types/proposal";

/**
 * OpenSpec change-directory reader. Combines fs/path IO over the openspec
 * change tree with pure string parsing of proposal/tasks/yaml content. Lives
 * in infra/ because reading the project's openspec directory is a capability,
 * not domain knowledge; the parsing helpers stay co-located and unit-testable.
 */

export type ProposalFileLocation = {
  changeId: string;
  directory: string;
  archived: boolean;
};

export function toTitleCase(input: string): string {
  // Convert a kebab/snake case string to a title-case display string.
  return input
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function stripArchivePrefix(changeId: string): string {
  // Archived change directory names are prefixed with `yyyy-MM-dd-`; remove it to get the
  // canonical change id used elsewhere.
  return changeId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

export function parseYamlStatus(content: string): ProposalStatus {
  const match = content.match(/^\s*status:\s*(creating|draft|applying|archived)\s*$/m);
  return (match?.[1] as ProposalStatus | undefined) ?? "draft";
}

export function parseYamlCreated(content: string): string {
  const match = content.match(/^\s*created:\s*(.+)\s*$/m);
  return match?.[1]?.trim() ?? "";
}

export function parseWhySummary(content: string): string {
  // Extract the first paragraph under the `## Why` heading, ignoring lists and stopping at
  // the next heading. Used to render a short summary in the proposal list.
  const whyMatch = content.match(/^\s*##\s+Why\s*$/m);
  if (!whyMatch) {
    return "";
  }

  const startIndex = (whyMatch.index ?? 0) + whyMatch[0].length;
  const tail = content.slice(startIndex);
  const lines = tail.split(/\r?\n/);
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\s*##\s+/.test(line)) {
      break;
    }

    if (line.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }

    if (/^\s*-\s+\[[ x]\]/.test(line) || /^\s*-\s+/.test(line)) {
      continue;
    }

    current.push(line.trim());
  }

  if (current.length > 0) {
    paragraphs.push(current.join(" ").trim());
  }

  const summary = paragraphs.find(Boolean) ?? "";
  return summary.length > 300 ? `${summary.slice(0, 300)}...` : summary;
}

export function countTasks(content: string): { totalTasks: number; doneTasks: number } {
  const doneTasks = (content.match(/^\s*-\s+\[x\]\s+/gim) ?? []).length;
  const pendingTasks = (content.match(/^\s*-\s+\[\s\]\s+/gim) ?? []).length;
  return { totalTasks: doneTasks + pendingTasks, doneTasks };
}

function normalizeChangeId(dirname: string): ProposalFileLocation {
  const archived = /^\d{4}-\d{2}-\d{2}-/.test(dirname);
  return { changeId: dirname, directory: dirname, archived };
}

export async function readIfExists(targetPath: string): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return null;
  }
}

async function readMetaFromDir(
  changeDir: string,
  entryName: string,
  owner: { folderId: string; folderName: string },
  target: { worktreeMode: ProposalWorktreeMode; worktreePath: string },
  statusOverride?: ProposalStatus
): Promise<ProposalMeta | null> {
  const location = normalizeChangeId(entryName);
  const yamlContent = await readIfExists(join(changeDir, ".openspec.yaml"));
  if (!yamlContent) {
    return null;
  }

  const proposalContent = await readIfExists(join(changeDir, "proposal.md"));
  const tasksContent = await readIfExists(join(changeDir, "tasks.md"));
  const status = statusOverride ?? parseYamlStatus(yamlContent);
  const date = parseYamlCreated(yamlContent);
  const why = proposalContent ? parseWhySummary(proposalContent) : "";
  const taskCounts = tasksContent ? countTasks(tasksContent) : { totalTasks: 0, doneTasks: 0 };

  return {
    id: stripArchivePrefix(location.changeId),
    proposalRef: { folderId: owner.folderId, changeId: stripArchivePrefix(location.changeId) },
    folderName: owner.folderName,
    title: toTitleCase(stripArchivePrefix(entryName)),
    status: location.archived ? "archived" : status,
    why,
    totalTasks: taskCounts.totalTasks,
    doneTasks: taskCounts.doneTasks,
    hasDesign: Boolean(await readIfExists(join(changeDir, "design.md"))),
    date,
    worktreeMode: target.worktreeMode,
    worktreePath: resolve(target.worktreePath),
  };
}

async function readActiveDir(
  dir: string,
  owner: { folderId: string; folderName: string },
  target: { worktreeMode: ProposalWorktreeMode; worktreePath: string }
): Promise<ProposalMeta[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const metas: ProposalMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "archive") {
        continue;
      }

      const meta = await readMetaFromDir(join(dir, entry.name), entry.name, owner, target);
      if (meta) {
        metas.push(meta);
      }
    }

    return metas;
  } catch {
    return [];
  }
}

async function readArchiveDir(
  dir: string,
  owner: { folderId: string; folderName: string },
  target: { worktreeMode: ProposalWorktreeMode; worktreePath: string }
): Promise<ProposalMeta[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const metas: ProposalMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const meta = await readMetaFromDir(
        join(dir, entry.name),
        entry.name,
        owner,
        target,
        "archived"
      );
      if (meta) {
        metas.push(meta);
      }
    }

    return metas;
  } catch {
    return [];
  }
}

function byCreatedDesc(left: ProposalMeta, right: ProposalMeta): number {
  const leftTime = new Date(left.date).getTime();
  const rightTime = new Date(right.date).getTime();
  return rightTime - leftTime;
}

export async function readRepositoryProposalFiles(input: {
  folderId: string;
  folderName: string;
  folderPath: string;
  registeredWorktreePaths: string[];
}): Promise<ProposalMeta[]> {
  const folderPath = resolve(input.folderPath);
  const owner = { folderId: input.folderId, folderName: input.folderName };
  const mainTarget = { worktreeMode: "main" as const, worktreePath: folderPath };
  const baseChangesDir = join(folderPath, "openspec", "changes");
  try {
    const fromMain = await readActiveDir(baseChangesDir, owner, mainTarget);
    const fromArchive = await readArchiveDir(join(baseChangesDir, "archive"), owner, mainTarget);
    const linkedPaths = [
      ...new Set(input.registeredWorktreePaths.map((value) => resolve(value))),
    ].filter((value) => value !== folderPath);
    const fromWorktrees = (
      await Promise.all(
        linkedPaths.map((worktreePath) =>
          readActiveDir(join(worktreePath, "openspec", "changes"), owner, {
            worktreeMode: "linked",
            worktreePath,
          })
        )
      )
    ).flat();
    const deduped = new Map<string, ProposalMeta>();

    for (const meta of fromMain) {
      deduped.set(meta.id, meta);
    }
    for (const meta of fromArchive) {
      deduped.set(meta.id, meta);
    }
    for (const meta of fromWorktrees) {
      deduped.set(meta.id, meta);
    }

    return Array.from(deduped.values()).sort(byCreatedDesc);
  } catch {
    return [];
  }
}

export async function readProposalFiles(projectPath: string): Promise<ProposalMeta[]> {
  const folderPath = resolve(projectPath);
  let linkedPaths: string[] = [];
  try {
    const entries = await fs.readdir(join(folderPath, ".worktrees"), { withFileTypes: true });
    linkedPaths = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(folderPath, ".worktrees", entry.name));
  } catch {
    linkedPaths = [];
  }
  return readRepositoryProposalFiles({
    folderId: "legacy-unqualified",
    folderName: basename(folderPath),
    folderPath,
    registeredWorktreePaths: linkedPaths,
  });
}

export async function findProposalMetaById(
  projectPath: string,
  changeId: string
): Promise<ProposalMeta | null> {
  const proposals = await readProposalFiles(projectPath);
  return proposals.find((proposal) => proposal.proposalRef.changeId === changeId) ?? null;
}

export type ResolvedChangeDir = {
  dir: string;
  archived: boolean;
  worktreePath?: string;
};

async function findArchiveDirByChangeId(
  archiveRoot: string,
  changeId: string
): Promise<string | null> {
  try {
    const entries = await fs.readdir(archiveRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (stripArchivePrefix(entry.name) !== changeId) {
        continue;
      }
      const dir = join(archiveRoot, entry.name);
      if (await readIfExists(join(dir, ".openspec.yaml"))) {
        return dir;
      }
    }
  } catch {
    // archive directory may not exist
  }
  return null;
}

export async function resolveChangeDirAnywhere(
  projectPath: string,
  changeId: string
): Promise<ResolvedChangeDir | null> {
  const mainActiveDir = join(projectPath, "openspec", "changes", changeId);
  if (await readIfExists(join(mainActiveDir, ".openspec.yaml"))) {
    return { dir: mainActiveDir, archived: false };
  }

  const mainArchiveRoot = join(projectPath, "openspec", "changes", "archive");
  const mainArchiveDirect = join(mainArchiveRoot, changeId);
  if (await readIfExists(join(mainArchiveDirect, ".openspec.yaml"))) {
    return { dir: mainArchiveDirect, archived: true };
  }
  const mainArchiveMatched = await findArchiveDirByChangeId(mainArchiveRoot, changeId);
  if (mainArchiveMatched) {
    return { dir: mainArchiveMatched, archived: true };
  }

  try {
    const worktreesRoot = join(projectPath, ".worktrees");
    const worktreeEntries = await fs.readdir(worktreesRoot, { withFileTypes: true });

    for (const entry of worktreeEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const worktreePath = resolve(worktreesRoot, entry.name);
      const activeDir = join(worktreePath, "openspec", "changes", changeId);
      if (await readIfExists(join(activeDir, ".openspec.yaml"))) {
        return { dir: activeDir, archived: false, worktreePath };
      }

      const worktreeArchiveRoot = join(worktreePath, "openspec", "changes", "archive");
      const worktreeArchiveDirect = join(worktreeArchiveRoot, changeId);
      if (await readIfExists(join(worktreeArchiveDirect, ".openspec.yaml"))) {
        return { dir: worktreeArchiveDirect, archived: true, worktreePath };
      }
      const worktreeArchiveMatched = await findArchiveDirByChangeId(worktreeArchiveRoot, changeId);
      if (worktreeArchiveMatched) {
        return { dir: worktreeArchiveMatched, archived: true, worktreePath };
      }
    }
  } catch {
    // .worktrees directory may not exist
  }

  return null;
}

export async function resolveChangeDir(
  projectPath: string,
  changeId: string
): Promise<string | null> {
  const resolved = await resolveChangeDirAnywhere(projectPath, changeId);
  return resolved?.dir ?? null;
}

export async function resolveChangeDirInTarget(
  worktreePath: string,
  changeId: string
): Promise<string | null> {
  const activeDir = join(worktreePath, "openspec", "changes", changeId);
  if (await readIfExists(join(activeDir, ".openspec.yaml"))) {
    return activeDir;
  }
  const archiveRoot = join(worktreePath, "openspec", "changes", "archive");
  const directArchive = join(archiveRoot, changeId);
  if (await readIfExists(join(directArchive, ".openspec.yaml"))) {
    return directArchive;
  }
  return findArchiveDirByChangeId(archiveRoot, changeId);
}

export async function readChangeFileInTarget(
  worktreePath: string,
  changeId: string,
  filename: string
): Promise<string | null> {
  const changeDir = await resolveChangeDirInTarget(worktreePath, changeId);
  return changeDir ? readIfExists(join(changeDir, basename(filename))) : null;
}

export async function readChangeFile(
  projectPath: string,
  changeId: string,
  filename: string
): Promise<string | null> {
  const changeDir = await resolveChangeDir(projectPath, changeId);
  if (!changeDir) return null;
  return readIfExists(join(changeDir, basename(filename)));
}

export async function resolveApplyRunChangeId(
  projectPath: string,
  changeId: string
): Promise<string> {
  const archiveDir = join(projectPath, "openspec", "changes", "archive", changeId);
  const archivedYamlPath = join(archiveDir, ".openspec.yaml");

  if (await readIfExists(archivedYamlPath)) {
    return stripArchivePrefix(changeId);
  }

  return changeId;
}
