import { promises as fs } from "fs";
import { isAbsolute, relative, resolve, sep } from "path";
import { pathToFileURL } from "url";
import { listRegisteredWorktreePaths } from "@main/infra/git/worktree-reader";
import { assertSessionWorkspaceSnapshotCurrent } from "./session-workspace-service";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import type { WorkspaceFileResourceRef } from "@shared/types/chat-prompt";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

export interface ResolvedMemberResource {
  folderId: string;
  worktreePath: string;
  repositoryRelativePath: string;
  canonicalPath: string;
  uri: string;
}

export interface MemberResourceResolverDependencies {
  assertSnapshotCurrent(snapshot: SessionWorkspaceSnapshot): Promise<SessionWorkspaceSnapshot>;
  realpath(path: string): Promise<string>;
  listRegisteredWorktrees(folderPath: string): Promise<{ paths: string[]; warning?: string }>;
  isFile(path: string): Promise<boolean>;
}

const defaultDependencies: MemberResourceResolverDependencies = {
  assertSnapshotCurrent: assertSessionWorkspaceSnapshotCurrent,
  realpath: (path) => fs.realpath(path),
  listRegisteredWorktrees: listRegisteredWorktreePaths,
  async isFile(path) {
    return (await fs.stat(path)).isFile();
  },
};

function isAbsoluteOnAnyPlatform(path: string): boolean {
  return isAbsolute(path) || /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path);
}

function isWithinRoot(root: string, target: string): boolean {
  const targetRelativePath = relative(root, target);
  return (
    targetRelativePath === "" ||
    (!targetRelativePath.startsWith(`..${sep}`) &&
      targetRelativePath !== ".." &&
      !isAbsolute(targetRelativePath))
  );
}

function validateRelativePath(path: string): string[] {
  const segments = path.split(/[\\/]/);
  if (
    !path ||
    isAbsoluteOnAnyPlatform(path) ||
    segments.some((segment) => segment === "" || segment === "..")
  ) {
    throw ipcError(
      IpcErrorCodes.SESSION_RESOURCE_PATH_INVALID,
      "Workspace file resource path must stay within its worktree",
      { repositoryRelativePath: path }
    );
  }
  return segments;
}

export async function resolveSessionMemberResource(
  snapshotInput: SessionWorkspaceSnapshot,
  ref: WorkspaceFileResourceRef,
  dependencies: MemberResourceResolverDependencies = defaultDependencies
): Promise<ResolvedMemberResource> {
  const snapshot = await dependencies.assertSnapshotCurrent(snapshotInput);
  const folder = snapshot.folders.find((candidate) => candidate.folderId === ref.folderId);
  if (!folder) {
    throw ipcError(
      IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED,
      "Workspace file resource is outside this Session snapshot",
      { folderId: ref.folderId }
    );
  }

  const relativeSegments = validateRelativePath(ref.repositoryRelativePath);
  let canonicalFolderPath: string;
  let canonicalWorktreePath: string;
  try {
    [canonicalFolderPath, canonicalWorktreePath] = await Promise.all([
      dependencies.realpath(folder.folderPath),
      dependencies.realpath(ref.worktreePath),
    ]);
  } catch {
    throw ipcError(
      IpcErrorCodes.SESSION_RESOURCE_WORKTREE_UNAVAILABLE,
      "Workspace file resource worktree is unavailable",
      { folderId: ref.folderId, worktreePath: ref.worktreePath }
    );
  }

  if (canonicalWorktreePath !== canonicalFolderPath) {
    const registered = await dependencies.listRegisteredWorktrees(canonicalFolderPath);
    if (!registered.paths.includes(canonicalWorktreePath)) {
      throw ipcError(
        IpcErrorCodes.SESSION_RESOURCE_WORKTREE_UNAVAILABLE,
        "Workspace file resource worktree is no longer registered",
        {
          folderId: ref.folderId,
          worktreePath: ref.worktreePath,
          warning: registered.warning,
        }
      );
    }
  }

  const requestedTarget = resolve(canonicalWorktreePath, ...relativeSegments);
  let canonicalTarget: string;
  try {
    canonicalTarget = await dependencies.realpath(requestedTarget);
    if (!isWithinRoot(canonicalWorktreePath, canonicalTarget)) {
      throw new Error("canonical target escaped worktree");
    }
    if (!(await dependencies.isFile(canonicalTarget))) {
      throw new Error("target is not a regular file");
    }
  } catch {
    throw ipcError(
      IpcErrorCodes.SESSION_RESOURCE_PATH_INVALID,
      "Workspace file resource target is unavailable or outside its worktree",
      { folderId: ref.folderId, repositoryRelativePath: ref.repositoryRelativePath }
    );
  }

  return {
    folderId: ref.folderId,
    worktreePath: canonicalWorktreePath,
    repositoryRelativePath: ref.repositoryRelativePath,
    canonicalPath: canonicalTarget,
    uri: pathToFileURL(canonicalTarget).toString(),
  };
}
