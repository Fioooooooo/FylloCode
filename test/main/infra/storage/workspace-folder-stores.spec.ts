import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

let tempRoot = "";

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => join(tempRoot, subPath)),
}));

import {
  listWorkspaces,
  loadWorkspace,
  saveWorkspace,
  workspaceMetaPath,
} from "@main/infra/storage/workspace-store";
import {
  listFolders,
  loadFolder,
  saveFolder,
  folderMetaPath,
} from "@main/infra/storage/folder-store";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

function workspace(id: string): WorkspaceMeta {
  return {
    version: 2,
    id,
    name: id,
    kind: "folder",
    isDeleted: false,
    folderIds: [id],
    primaryFolderId: id,
    createdAt: "2026-08-02T00:00:00.000Z",
    lastOpenedAt: "2026-08-02T00:00:00.000Z",
  };
}

function folder(id: string): FolderMeta {
  return { version: 1, id, name: id, path: `/work/${id}` };
}

describe("Workspace and Folder stores", () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "fyllocode-workspace-store-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("atomically round-trips and lists Workspace metadata", async () => {
    await saveWorkspace(workspace("workspace-1"));
    await saveWorkspace(workspace("workspace-2"));

    await expect(loadWorkspace("workspace-1")).resolves.toEqual(workspace("workspace-1"));
    await expect(listWorkspaces()).resolves.toEqual([
      workspace("workspace-1"),
      workspace("workspace-2"),
    ]);
  });

  it("round-trips and lists Folder metadata independently", async () => {
    await saveFolder(folder("folder-1"));
    await saveFolder(folder("folder-2"));

    await expect(loadFolder("folder-1")).resolves.toEqual(folder("folder-1"));
    await expect(listFolders()).resolves.toEqual([folder("folder-1"), folder("folder-2")]);
  });

  it("surfaces corrupt metadata instead of treating it as missing", async () => {
    await saveWorkspace(workspace("workspace-1"));
    writeFileSync(workspaceMetaPath("workspace-1"), "{}", "utf8");
    await expect(loadWorkspace("workspace-1")).rejects.toMatchObject({
      code: "WORKSPACE_META_INVALID",
    });

    await saveFolder(folder("folder-1"));
    writeFileSync(folderMetaPath("folder-1"), "{}", "utf8");
    await expect(loadFolder("folder-1")).rejects.toMatchObject({ code: "FOLDER_META_INVALID" });
  });

  it("keeps Workspace and Folder metadata in separate roots", async () => {
    await saveWorkspace(workspace("same-id"));
    await saveFolder(folder("same-id"));

    expect(dirname(workspaceMetaPath("same-id"))).toContain("/workspaces/");
    expect(dirname(folderMetaPath("same-id"))).toContain("/workspace-folders/");
  });
});
