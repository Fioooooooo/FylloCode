import { describe, expect, it, vi } from "vitest";
import { resolveSessionMemberResource } from "@main/services/session/chat/member-resource-resolver";
import type { MemberResourceResolverDependencies } from "@main/services/session/chat/member-resource-resolver";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

const snapshot: SessionWorkspaceSnapshot = {
  workspaceId: "workspace-1",
  workspaceKind: "collection",
  primaryFolderId: "folder-1",
  folders: [
    { folderId: "folder-1", folderName: "App", folderPath: "/repos/app" },
    { folderId: "folder-2", folderName: "API", folderPath: "/repos/api" },
  ],
  cwd: "/repos/app",
  additionalDirectories: ["/repos/api"],
};

function dependencies(
  overrides: Partial<MemberResourceResolverDependencies> = {}
): MemberResourceResolverDependencies {
  return {
    assertSnapshotCurrent: vi.fn(async (value) => value),
    realpath: vi.fn(async (path: string) => path),
    listRegisteredWorktrees: vi.fn(async () => ({ paths: [] })),
    isFile: vi.fn(async () => true),
    ...overrides,
  };
}

describe("resolveSessionMemberResource", () => {
  it("resolves a file beneath the snapshotted main worktree", async () => {
    await expect(
      resolveSessionMemberResource(
        snapshot,
        {
          folderId: "folder-1",
          worktreePath: "/repos/app",
          repositoryRelativePath: "src/main.ts",
        },
        dependencies()
      )
    ).resolves.toMatchObject({
      folderId: "folder-1",
      worktreePath: "/repos/app",
      canonicalPath: "/repos/app/src/main.ts",
      uri: "file:///repos/app/src/main.ts",
    });
  });

  it("keeps a registered linked worktree as the resource owner", async () => {
    const deps = dependencies({
      listRegisteredWorktrees: vi.fn(async () => ({ paths: ["/worktrees/app-feature"] })),
    });

    await expect(
      resolveSessionMemberResource(
        snapshot,
        {
          folderId: "folder-1",
          worktreePath: "/worktrees/app-feature",
          repositoryRelativePath: "src/feature.ts",
        },
        deps
      )
    ).resolves.toMatchObject({
      worktreePath: "/worktrees/app-feature",
      canonicalPath: "/worktrees/app-feature/src/feature.ts",
    });
  });

  it("rejects a Folder that is only trusted by the Window", async () => {
    await expect(
      resolveSessionMemberResource(
        snapshot,
        {
          folderId: "folder-window-only",
          worktreePath: "/repos/window-only",
          repositoryRelativePath: "src/main.ts",
        },
        dependencies()
      )
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED });
  });

  it.each(["../secret", "/tmp/secret", "C:\\tmp\\secret", "src//secret"])(
    "rejects invalid repository-relative path %s",
    async (repositoryRelativePath) => {
      await expect(
        resolveSessionMemberResource(
          snapshot,
          { folderId: "folder-1", worktreePath: "/repos/app", repositoryRelativePath },
          dependencies()
        )
      ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_RESOURCE_PATH_INVALID });
    }
  );

  it("rejects a canonical symlink escape", async () => {
    const deps = dependencies({
      realpath: vi.fn(async (path: string) =>
        path === "/repos/app/src/link.ts" ? "/outside/secret.ts" : path
      ),
    });

    await expect(
      resolveSessionMemberResource(
        snapshot,
        {
          folderId: "folder-1",
          worktreePath: "/repos/app",
          repositoryRelativePath: "src/link.ts",
        },
        deps
      )
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_RESOURCE_PATH_INVALID });
  });

  it("rejects a removed linked worktree without falling back to main", async () => {
    const deps = dependencies({
      listRegisteredWorktrees: vi.fn(async () => ({ paths: ["/worktrees/another"] })),
    });

    await expect(
      resolveSessionMemberResource(
        snapshot,
        {
          folderId: "folder-1",
          worktreePath: "/worktrees/removed",
          repositoryRelativePath: "src/main.ts",
        },
        deps
      )
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_RESOURCE_WORKTREE_UNAVAILABLE });
  });

  it("propagates snapshot stale validation before resolving paths", async () => {
    const staleError = Object.assign(new Error("removed"), {
      code: IpcErrorCodes.SESSION_FOLDER_REMOVED,
    });
    const deps = dependencies({
      assertSnapshotCurrent: vi.fn(async () => {
        throw staleError;
      }),
    });

    await expect(
      resolveSessionMemberResource(
        snapshot,
        {
          folderId: "folder-1",
          worktreePath: "/repos/app",
          repositoryRelativePath: "src/main.ts",
        },
        deps
      )
    ).rejects.toBe(staleError);
    expect(deps.realpath).not.toHaveBeenCalled();
  });
});
