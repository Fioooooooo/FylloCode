import { describe, expect, it, vi } from "vitest";
import {
  WorkspaceResolver,
  type WorkspaceResolverDependencies,
} from "@main/services/workspace/resolver/workspace-resolver";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

function workspace(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    version: 2,
    id: "workspace-1",
    name: "Workspace 1",
    kind: "folder",
    isDeleted: false,
    folderIds: ["workspace-1"],
    primaryFolderId: "workspace-1",
    createdAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function folder(overrides: Partial<FolderMeta> = {}): FolderMeta {
  return {
    version: 1,
    id: "workspace-1",
    name: "Folder 1",
    path: "/work/repo",
    ...overrides,
  };
}

function fixture(
  options: {
    workspace?: WorkspaceMeta | null;
    folders?: FolderMeta[];
    missingPaths?: string[];
    registeredWorktrees?: string[];
    git?: boolean;
  } = {}
) {
  const meta = options.workspace === undefined ? workspace() : options.workspace;
  const folders = options.folders ?? [folder()];
  const missingPaths = new Set(options.missingPaths ?? []);
  const dependencies: WorkspaceResolverDependencies = {
    loadWorkspace: vi.fn(async () => meta),
    loadFolder: vi.fn(async (folderId) => folders.find((item) => item.id === folderId) ?? null),
    realpath: vi.fn(async (path) => {
      if (missingPaths.has(path)) throw new Error("missing");
      return path.replace("/alias/", "/work/");
    }),
    workspaceDataDir: vi.fn((workspaceId) => `/data/workspaces/${workspaceId}`),
    listRegisteredWorktrees: vi.fn(async () => ({
      paths: options.registeredWorktrees ?? ["/work/repo", "/work/repo-linked"],
    })),
    isGitRepository: vi.fn(async () => options.git ?? true),
  };
  return { dependencies, resolver: new WorkspaceResolver(dependencies) };
}

describe("WorkspaceResolver", () => {
  it("resolves a migrated Folder Workspace without deriving identity from path", async () => {
    const { resolver } = fixture();
    await expect(resolver.resolveWorkspace("workspace-1")).resolves.toEqual({
      workspaceId: "workspace-1",
      workspaceName: "Workspace 1",
      workspaceKind: "folder",
      workspaceDataDir: "/data/workspaces/workspace-1",
      primaryFolderId: "workspace-1",
      folders: [
        {
          folderId: "workspace-1",
          folderName: "Folder 1",
          folderPath: "/work/repo",
          pathMissing: false,
        },
      ],
      availableFolders: [
        {
          folderId: "workspace-1",
          folderName: "Folder 1",
          folderPath: "/work/repo",
          pathMissing: false,
        },
      ],
      missingFolders: [],
      cwd: "/work/repo",
      additionalDirectories: [],
    });
  });

  it("returns a structured primary-missing error without an Agent cwd", async () => {
    const { resolver } = fixture({ missingPaths: ["/work/repo"] });
    await expect(resolver.resolveWorkspace("workspace-1")).rejects.toMatchObject({
      code: "WORKSPACE_PRIMARY_FOLDER_MISSING",
      details: { workspaceId: "workspace-1", primaryFolderId: "workspace-1" },
    });
  });

  it("rejects a repository owner outside the Workspace membership", async () => {
    const { resolver } = fixture();
    await expect(
      resolver.resolveRepositoryTarget({
        workspaceId: "workspace-1",
        folderId: "folder-other",
        worktreePath: "/work/repo",
      })
    ).rejects.toMatchObject({ code: "WORKSPACE_FOLDER_NOT_MEMBER" });
  });

  it("accepts the main root and a registered linked worktree", async () => {
    const { resolver } = fixture();
    await expect(
      resolver.resolveRepositoryTarget({
        workspaceId: "workspace-1",
        folderId: "workspace-1",
        worktreePath: "/work/repo",
      })
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      folderId: "workspace-1",
      worktreePath: "/work/repo",
    });

    await expect(
      resolver.resolveRepositoryTarget({
        workspaceId: "workspace-1",
        folderId: "workspace-1",
        worktreePath: "/work/repo-linked",
      })
    ).resolves.toMatchObject({ worktreePath: "/work/repo-linked" });
  });

  it("rejects an arbitrary or non-Git repository target", async () => {
    const { resolver } = fixture();
    await expect(
      resolver.resolveRepositoryTarget({
        workspaceId: "workspace-1",
        folderId: "workspace-1",
        worktreePath: "/work/not-registered",
      })
    ).rejects.toMatchObject({ code: "WORKTREE_NOT_REGISTERED" });

    const nonGit = fixture({ git: false });
    await expect(
      nonGit.resolver.resolveRepositoryTarget({
        workspaceId: "workspace-1",
        folderId: "workspace-1",
        worktreePath: "/work/repo",
      })
    ).rejects.toMatchObject({ code: "REPOSITORY_NOT_GIT" });
  });
});
