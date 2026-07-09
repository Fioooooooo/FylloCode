import { promises as fs, type Dirent } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { runGit } from "./git-stats";

export type ArchiveCommitInfo = {
  changeId: string;
  archivedChangeId: string;
  hash: string;
  committedAt: string | null;
};

const ARCHIVE_ROOT = "openspec/changes/archive";
const ARCHIVE_DIR_RE = /^\d{4}-\d{2}-\d{2}-(.+)$/;
const COMMIT_HEADER_PREFIX = "COMMIT\0";

function archiveAnchorPath(archivedChangeId: string): string {
  return `${ARCHIVE_ROOT}/${archivedChangeId}/.openspec.yaml`;
}

function changeIdFromArchiveDir(dirName: string): string | null {
  return ARCHIVE_DIR_RE.exec(dirName)?.[1] ?? null;
}

async function resolveArchiveDirs(
  projectPath: string,
  changeIds: Set<string>
): Promise<Map<string, string>> {
  if (changeIds.size === 0) {
    return new Map();
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(join(projectPath, ARCHIVE_ROOT), { withFileTypes: true });
  } catch {
    return new Map();
  }

  const matches = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const changeId = changeIdFromArchiveDir(entry.name);
    if (!changeId || !changeIds.has(changeId)) {
      continue;
    }

    const existing = matches.get(changeId) ?? [];
    existing.push(entry.name);
    matches.set(changeId, existing);
  }

  const result = new Map<string, string>();
  for (const [changeId, archivedChangeIds] of matches) {
    archivedChangeIds.sort((left, right) => right.localeCompare(left));
    if (archivedChangeIds.length > 1) {
      logger.warn(
        `[overview] multiple archived changes found for change=${changeId}; using ${archivedChangeIds[0]}`
      );
    }
    result.set(changeId, archivedChangeIds[0]!);
  }

  return result;
}

function parseCommitHeader(line: string): { hash: string; committedAt: string | null } | null {
  if (!line.startsWith(COMMIT_HEADER_PREFIX)) {
    return null;
  }

  const [, hash, committedAt] = line.split("\0");
  if (!hash) {
    return null;
  }

  return {
    hash,
    committedAt: committedAt || null,
  };
}

function parseArchiveCommitLog(
  output: string,
  archiveDirsByChangeId: Map<string, string>
): Map<string, ArchiveCommitInfo> {
  const anchorToChange = new Map(
    Array.from(archiveDirsByChangeId, ([changeId, archivedChangeId]) => [
      archiveAnchorPath(archivedChangeId),
      { changeId, archivedChangeId },
    ])
  );
  const result = new Map<string, ArchiveCommitInfo>();
  let currentCommit: { hash: string; committedAt: string | null } | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const header = parseCommitHeader(line);
    if (header) {
      currentCommit = header;
      continue;
    }

    if (!currentCommit) {
      continue;
    }

    const addedPath = /^A\s+(.+)$/.exec(line)?.[1];
    if (!addedPath) {
      continue;
    }

    const match = anchorToChange.get(addedPath);
    if (!match || result.has(match.changeId)) {
      continue;
    }

    result.set(match.changeId, {
      changeId: match.changeId,
      archivedChangeId: match.archivedChangeId,
      hash: currentCommit.hash,
      committedAt: currentCommit.committedAt,
    });
  }

  return result;
}

export async function buildArchiveCommitIndex(
  projectPath: string,
  changeIds: Iterable<string>
): Promise<Map<string, ArchiveCommitInfo>> {
  const requestedChangeIds = new Set(Array.from(changeIds).filter(Boolean));
  const archiveDirsByChangeId = await resolveArchiveDirs(projectPath, requestedChangeIds);
  if (archiveDirsByChangeId.size === 0) {
    return new Map();
  }

  const anchorPaths = Array.from(archiveDirsByChangeId.values()).map(archiveAnchorPath);
  try {
    const output = await runGit(projectPath, [
      "log",
      "--diff-filter=A",
      "--format=COMMIT%x00%H%x00%cI",
      "--name-status",
      "--",
      ...anchorPaths,
    ]);
    return parseArchiveCommitLog(output, archiveDirsByChangeId);
  } catch (error: unknown) {
    logger.warn("[overview] failed to build archive commit index", error);
    return new Map();
  }
}
