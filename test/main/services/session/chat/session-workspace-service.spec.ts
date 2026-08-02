import { describe, expect, it } from "vitest";
import {
  assertSessionWorkspaceSnapshotCurrent,
  type SessionWorkspaceServiceDependencies,
} from "@main/services/session/chat/session-workspace-service";
import type { SessionWorkspaceSnapshot, WorkspaceInfo } from "@shared/types/workspace";

const snapshot: SessionWorkspaceSnapshot = {
  workspaceId: "workspace-a",
  workspaceKind: "collection",
  primaryFolderId: "folder-a",
  folders: [
    { folderId: "folder-a", folderName: "A", folderPath: "/repos/a" },
    { folderId: "folder-b", folderName: "B", folderPath: "/repos/b" },
  ],
  cwd: "/repos/a",
  additionalDirectories: ["/repos/b"],
};

function workspace(
  folders: WorkspaceInfo["folders"] = [
    {
      folderId: "folder-a",
      folderName: "A",
      folderPath: "/repos/a",
      pathMissing: false,
      isPrimary: true,
    },
    {
      folderId: "folder-b",
      folderName: "B",
      folderPath: "/repos/b",
      pathMissing: false,
      isPrimary: false,
    },
  ]
): WorkspaceInfo {
  const primary = folders[0]!;
  return {
    version: 2,
    id: "workspace-a",
    name: "Workspace A",
    kind: "collection",
    isDeleted: false,
    folderIds: folders.map((folder) => folder.folderId),
    primaryFolderId: primary.folderId,
    createdAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
    primaryFolder: {
      version: 1,
      id: primary.folderId,
      name: primary.folderName,
      path: primary.folderPath,
    },
    primaryFolderMetaPath: "/data/folders/folder-a/meta.json",
    pathMissing: primary.pathMissing,
    folders,
    availableFolders: folders.filter((folder) => !folder.pathMissing),
    missingFolders: folders.filter((folder) => folder.pathMissing),
    chatAvailable: true,
  };
}

function dependencies(info: WorkspaceInfo): SessionWorkspaceServiceDependencies {
  return { getWorkspaceInfo: async () => info };
}

describe("session-workspace-service", () => {
  it("returns the unchanged snapshot when every member and path is current", async () => {
    await expect(
      assertSessionWorkspaceSnapshotCurrent(snapshot, dependencies(workspace()))
    ).resolves.toEqual(snapshot);
  });

  it("rejects the whole snapshot when a member was removed", async () => {
    await expect(
      assertSessionWorkspaceSnapshotCurrent(
        snapshot,
        dependencies(
          workspace(workspace().folders.filter((folder) => folder.folderId !== "folder-b"))
        )
      )
    ).rejects.toMatchObject({
      code: "SESSION_FOLDER_REMOVED",
      details: { folderId: "folder-b", snapshottedPath: "/repos/b" },
    });
  });

  it("distinguishes a missing snapshotted path from relocation", async () => {
    const missingFolders = workspace().folders.map((folder) =>
      folder.folderId === "folder-b" ? { ...folder, pathMissing: true } : folder
    );
    await expect(
      assertSessionWorkspaceSnapshotCurrent(snapshot, dependencies(workspace(missingFolders)))
    ).rejects.toMatchObject({ code: "SESSION_FOLDER_PATH_MISSING" });

    const relocatedFolders = workspace().folders.map((folder) =>
      folder.folderId === "folder-b" ? { ...folder, folderPath: "/repos/b-new" } : folder
    );
    await expect(
      assertSessionWorkspaceSnapshotCurrent(snapshot, dependencies(workspace(relocatedFolders)))
    ).rejects.toMatchObject({
      code: "SESSION_FOLDER_RELOCATED",
      details: { folderId: "folder-b", currentPath: "/repos/b-new" },
    });
  });

  it("continues path validation after the same Folder identity is re-added", async () => {
    const readded = workspace().folders.map((folder) =>
      folder.folderId === "folder-b" ? { ...folder, folderPath: "/repos/readded-b" } : folder
    );

    await expect(
      assertSessionWorkspaceSnapshotCurrent(snapshot, dependencies(workspace(readded)))
    ).rejects.toMatchObject({ code: "SESSION_FOLDER_RELOCATED" });
  });
});
