import { describe, expect, it } from "vitest";
import {
  createSessionWorkspaceSnapshot,
  validateSessionWorkspaceSnapshot,
} from "@main/domain/session/chat/session-workspace-snapshot";
import type { ResolvedWorkspace, ResolvedWorkspaceFolder } from "@shared/types/workspace";

function folder(
  folderId: string,
  folderPath: string,
  pathMissing = false
): ResolvedWorkspaceFolder {
  return {
    folderId,
    folderName: `Folder ${folderId}`,
    folderPath,
    pathMissing,
  };
}

function workspace(overrides: Partial<ResolvedWorkspace> = {}): ResolvedWorkspace {
  const folders = [folder("folder-b", "/repos/b"), folder("folder-a", "/repos/a")];
  return {
    workspaceId: "workspace-a",
    workspaceName: "Workspace A",
    workspaceKind: "collection",
    workspaceDataDir: "/data/workspaces/workspace-a",
    primaryFolderId: "folder-a",
    folders,
    availableFolders: folders,
    missingFolders: [],
    cwd: "/repos/a",
    additionalDirectories: ["/repos/b"],
    ...overrides,
  };
}

describe("session-workspace-snapshot", () => {
  it("keeps Workspace member order while deriving primary cwd and additional directories", () => {
    expect(createSessionWorkspaceSnapshot(workspace())).toEqual({
      workspaceId: "workspace-a",
      workspaceKind: "collection",
      primaryFolderId: "folder-a",
      folders: [
        { folderId: "folder-b", folderName: "Folder folder-b", folderPath: "/repos/b" },
        { folderId: "folder-a", folderName: "Folder folder-a", folderPath: "/repos/a" },
      ],
      cwd: "/repos/a",
      additionalDirectories: ["/repos/b"],
    });
  });

  it("excludes a missing secondary because only availableFolders are snapshotted", () => {
    const primary = folder("folder-a", "/repos/a");
    const missing = folder("folder-b", "/repos/b", true);

    expect(
      createSessionWorkspaceSnapshot(
        workspace({
          folders: [primary, missing],
          availableFolders: [primary],
          missingFolders: [missing],
          additionalDirectories: [],
        })
      )
    ).toMatchObject({
      folders: [{ folderId: "folder-a" }],
      cwd: "/repos/a",
      additionalDirectories: [],
    });
  });

  it("rejects an unavailable primary and duplicate Folder identity", () => {
    expect(() =>
      createSessionWorkspaceSnapshot(
        workspace({
          availableFolders: [folder("folder-b", "/repos/b")],
        })
      )
    ).toThrowError(expect.objectContaining({ code: "PRIMARY_MISSING" }));

    expect(() =>
      createSessionWorkspaceSnapshot(
        workspace({
          availableFolders: [folder("folder-a", "/repos/a"), folder("folder-a", "/repos/a")],
        })
      )
    ).toThrowError(expect.objectContaining({ code: "FOLDER_DUPLICATE" }));
  });

  it("rejects inconsistent persisted directory projections", () => {
    expect(() =>
      validateSessionWorkspaceSnapshot({
        workspaceId: "workspace-a",
        workspaceKind: "collection",
        primaryFolderId: "folder-a",
        folders: [
          { folderId: "folder-a", folderName: "A", folderPath: "/repos/a" },
          { folderId: "folder-b", folderName: "B", folderPath: "/repos/b" },
        ],
        cwd: "/repos/b",
        additionalDirectories: ["/repos/a"],
      })
    ).toThrowError(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });
});
