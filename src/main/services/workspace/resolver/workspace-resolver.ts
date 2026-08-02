import { promises as fs } from "fs";
import { join } from "path";
import { validateWorkspaceFolderPaths } from "@main/domain/workspace/model";
import { listRegisteredWorktreePaths } from "@main/infra/git/worktree-reader";
import { loadFolder } from "@main/infra/storage/folder-store";
import { loadWorkspace } from "@main/infra/storage/workspace-store";
import { workspaceDataDir } from "@main/infra/storage/workspace-paths";
import type {
  FolderMeta,
  ResolvedRepositoryTarget,
  ResolvedWorkspace,
  ResolvedWorkspaceFolder,
  WorkspaceMeta,
} from "@shared/types/workspace";

export type WorkspaceResolverErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_FOLDER_NOT_FOUND"
  | "WORKSPACE_PRIMARY_FOLDER_MISSING"
  | "WORKSPACE_FOLDER_NOT_MEMBER"
  | "WORKSPACE_FOLDER_PATH_MISSING"
  | "REPOSITORY_NOT_GIT"
  | "WORKTREE_NOT_REGISTERED";

export class WorkspaceResolverError extends Error {
  constructor(
    public readonly code: WorkspaceResolverErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "WorkspaceResolverError";
  }
}

export interface WorkspaceResolverDependencies {
  loadWorkspace(workspaceId: string): Promise<WorkspaceMeta | null>;
  loadFolder(folderId: string): Promise<FolderMeta | null>;
  realpath(path: string): Promise<string>;
  workspaceDataDir(workspaceId: string): string;
  listRegisteredWorktrees(folderPath: string): Promise<{ paths: string[]; warning?: string }>;
  isGitRepository(folderPath: string): Promise<boolean>;
}

const defaultDependencies: WorkspaceResolverDependencies = {
  loadWorkspace,
  loadFolder,
  realpath: (path) => fs.realpath(path),
  workspaceDataDir,
  listRegisteredWorktrees: listRegisteredWorktreePaths,
  async isGitRepository(folderPath) {
    try {
      await fs.stat(join(folderPath, ".git"));
      return true;
    } catch {
      return false;
    }
  },
};

export class WorkspaceResolver {
  constructor(private readonly dependencies: WorkspaceResolverDependencies = defaultDependencies) {}

  async resolveWorkspace(workspaceId: string): Promise<ResolvedWorkspace> {
    const workspace = await this.dependencies.loadWorkspace(workspaceId);
    if (!workspace) {
      throw new WorkspaceResolverError("WORKSPACE_NOT_FOUND", "Workspace does not exist", {
        workspaceId,
      });
    }

    const folders = await Promise.all(
      workspace.folderIds.map(async (folderId): Promise<ResolvedWorkspaceFolder> => {
        const folder = await this.dependencies.loadFolder(folderId);
        if (!folder) {
          throw new WorkspaceResolverError(
            "WORKSPACE_FOLDER_NOT_FOUND",
            "Workspace references an unknown Folder",
            { workspaceId, folderId }
          );
        }

        try {
          return {
            folderId: folder.id,
            folderName: folder.name,
            folderPath: await this.dependencies.realpath(folder.path),
            pathMissing: false,
          };
        } catch {
          return {
            folderId: folder.id,
            folderName: folder.name,
            folderPath: folder.path,
            pathMissing: true,
          };
        }
      })
    );

    const availableFolders = folders.filter((folder) => !folder.pathMissing);
    const missingFolders = folders.filter((folder) => folder.pathMissing);
    validateWorkspaceFolderPaths(
      availableFolders.map((folder) => ({
        version: 1,
        id: folder.folderId,
        name: folder.folderName,
        path: folder.folderPath,
      }))
    );

    const primary = folders.find((folder) => folder.folderId === workspace.primaryFolderId);
    if (!primary || primary.pathMissing) {
      throw new WorkspaceResolverError(
        "WORKSPACE_PRIMARY_FOLDER_MISSING",
        "Workspace primary Folder path is unavailable",
        {
          workspaceId,
          primaryFolderId: workspace.primaryFolderId,
          folderPath: primary?.folderPath,
        }
      );
    }

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceKind: workspace.kind,
      workspaceDataDir: this.dependencies.workspaceDataDir(workspace.id),
      primaryFolderId: workspace.primaryFolderId,
      folders,
      availableFolders,
      missingFolders,
      cwd: primary.folderPath,
      additionalDirectories: availableFolders
        .filter((folder) => folder.folderId !== primary.folderId)
        .map((folder) => folder.folderPath),
    };
  }

  async resolveRepositoryTarget(input: {
    workspaceId: string;
    folderId: string;
    worktreePath: string;
  }): Promise<ResolvedRepositoryTarget> {
    const workspace = await this.resolveWorkspace(input.workspaceId);
    const folder = workspace.folders.find((candidate) => candidate.folderId === input.folderId);
    if (!folder) {
      throw new WorkspaceResolverError(
        "WORKSPACE_FOLDER_NOT_MEMBER",
        "Repository target Folder is not a Workspace member",
        { workspaceId: input.workspaceId, folderId: input.folderId }
      );
    }
    if (folder.pathMissing) {
      throw new WorkspaceResolverError(
        "WORKSPACE_FOLDER_PATH_MISSING",
        "Repository target Folder path is unavailable",
        { workspaceId: input.workspaceId, folderId: input.folderId }
      );
    }
    if (!(await this.dependencies.isGitRepository(folder.folderPath))) {
      throw new WorkspaceResolverError("REPOSITORY_NOT_GIT", "Folder is not a Git repository", {
        workspaceId: input.workspaceId,
        folderId: input.folderId,
        folderPath: folder.folderPath,
      });
    }

    let canonicalWorktreePath: string;
    try {
      canonicalWorktreePath = await this.dependencies.realpath(input.worktreePath);
    } catch {
      throw new WorkspaceResolverError(
        "WORKTREE_NOT_REGISTERED",
        "Repository worktree path is unavailable",
        {
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          worktreePath: input.worktreePath,
        }
      );
    }

    if (canonicalWorktreePath !== folder.folderPath) {
      const registered = await this.dependencies.listRegisteredWorktrees(folder.folderPath);
      if (!registered.paths.includes(canonicalWorktreePath)) {
        throw new WorkspaceResolverError(
          "WORKTREE_NOT_REGISTERED",
          "Repository target is not a registered worktree",
          {
            workspaceId: input.workspaceId,
            folderId: input.folderId,
            worktreePath: canonicalWorktreePath,
            warning: registered.warning,
          }
        );
      }
    }

    return {
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      worktreePath: canonicalWorktreePath,
    };
  }
}

export const workspaceResolver = new WorkspaceResolver();

export const resolveWorkspace = (workspaceId: string): Promise<ResolvedWorkspace> =>
  workspaceResolver.resolveWorkspace(workspaceId);

export const resolveRepositoryTarget = (
  input: Parameters<WorkspaceResolver["resolveRepositoryTarget"]>[0]
): Promise<ResolvedRepositoryTarget> => workspaceResolver.resolveRepositoryTarget(input);
