import type { McpFolderEntry, McpWorkspaceDescriptorV2 } from "@shared/types/mcp-workspace";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import spawn from "cross-spawn";
import { getWorkspaceContext } from "./workspace-context";

export type WorkspaceResolverErrorCode =
  | "MCP_WORKSPACE_FOLDER_UNAUTHORIZED"
  | "MCP_WORKSPACE_OWNER_REQUIRED"
  | "MCP_WORKTREE_PATH_INVALID"
  | "MCP_WORKTREE_LIST_FAILED"
  | "MCP_WORKTREE_NOT_REGISTERED";

export class WorkspaceResolverError extends Error {
  constructor(
    public readonly code: WorkspaceResolverErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = "WorkspaceResolverError";
    Object.freeze(this.details);
  }
}

export function resolveWorkspace(): McpWorkspaceDescriptorV2 {
  return getWorkspaceContext();
}

export function resolveFolder(folderId: string): McpFolderEntry {
  const workspace = resolveWorkspace();
  const folder = workspace.folders.find((candidate) => candidate.folderId === folderId);
  if (!folder) {
    throw new WorkspaceResolverError(
      "MCP_WORKSPACE_FOLDER_UNAUTHORIZED",
      `Folder is not authorized for this MCP activation: ${folderId}`,
      { workspaceId: workspace.workspaceId, folderId }
    );
  }
  return folder;
}

export function resolvePrimaryFolder(): McpFolderEntry {
  return resolveFolder(resolveWorkspace().primaryFolderId);
}

export function resolveSingleFolder(folderId?: string): McpFolderEntry {
  if (folderId) {
    return resolveFolder(folderId);
  }

  const workspace = resolveWorkspace();
  if (workspace.folders.length !== 1) {
    throw new WorkspaceResolverError(
      "MCP_WORKSPACE_OWNER_REQUIRED",
      "A folderId is required for a repository-scoped operation in a multi-root Workspace",
      { workspaceId: workspace.workspaceId, folderCount: workspace.folders.length }
    );
  }
  return workspace.folders[0]!;
}

export interface WorktreeValidationDependencies {
  realpath(path: string): string;
  listRegisteredWorktrees(folderPath: string): string[];
}

export const worktreeGitChildProcess = {
  spawnSync: spawn.sync,
};

function listRegisteredWorktrees(folderPath: string): string[] {
  const result = worktreeGitChildProcess.spawnSync(
    "git",
    ["-C", folderPath, "worktree", "list", "--porcelain"],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new WorkspaceResolverError(
      "MCP_WORKTREE_LIST_FAILED",
      "Unable to read registered worktrees for the authorized Folder",
      { folderPath }
    );
  }
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter(Boolean)
    .map((path) => realpathSync.native(path));
}

const defaultWorktreeValidationDependencies: WorktreeValidationDependencies = {
  realpath: (path) => realpathSync.native(path),
  listRegisteredWorktrees,
};

export function validateWorktree(
  folderId: string,
  worktreePath: string,
  dependencies: WorktreeValidationDependencies = defaultWorktreeValidationDependencies
): string {
  const folder = resolveFolder(folderId);
  if (!isAbsolute(worktreePath)) {
    throw new WorkspaceResolverError(
      "MCP_WORKTREE_PATH_INVALID",
      "targetPath must be an absolute path",
      { folderId }
    );
  }

  let canonicalFolderPath: string;
  let canonicalWorktreePath: string;
  try {
    canonicalFolderPath = dependencies.realpath(folder.folderPath);
  } catch {
    throw new WorkspaceResolverError(
      "MCP_WORKTREE_PATH_INVALID",
      "Authorized Folder path is unavailable",
      { folderId }
    );
  }
  try {
    canonicalWorktreePath = dependencies.realpath(resolve(worktreePath));
  } catch {
    throw new WorkspaceResolverError(
      "MCP_WORKTREE_NOT_REGISTERED",
      "targetPath is not a registered git worktree",
      { folderId, worktreePath }
    );
  }

  if (canonicalWorktreePath === canonicalFolderPath) {
    return canonicalWorktreePath;
  }

  const registeredPaths = new Set(
    dependencies
      .listRegisteredWorktrees(canonicalFolderPath)
      .map((path) => dependencies.realpath(path))
  );
  if (!registeredPaths.has(canonicalWorktreePath)) {
    throw new WorkspaceResolverError(
      "MCP_WORKTREE_NOT_REGISTERED",
      "worktreePath is not registered for the authorized Folder repository",
      { folderId, worktreePath: canonicalWorktreePath }
    );
  }

  return canonicalWorktreePath;
}
