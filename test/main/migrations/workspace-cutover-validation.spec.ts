import { describe, expect, it, vi } from "vitest";
import { encodeProjectPath } from "@main/migrations/legacy-project-path";
import { validateWorkspaceCutoverTargets } from "@main/migrations/workspace-cutover-validation";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

function project(id: string, path: string): LegacyProjectMeta {
  return {
    id,
    name: id,
    path,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
  };
}

function workspace(source: LegacyProjectMeta, legacyAppDataKey?: string): WorkspaceMeta {
  return {
    version: 2,
    id: source.id,
    name: source.name,
    kind: "folder",
    isDeleted: false,
    folderIds: [source.id],
    primaryFolderId: source.id,
    createdAt: source.createdAt,
    lastOpenedAt: source.lastOpenedAt,
    ...(legacyAppDataKey ? { legacyAppDataKey } : {}),
  };
}

function folder(source: LegacyProjectMeta): FolderMeta {
  return {
    version: 1,
    id: source.id,
    name: source.name,
    path: source.path,
  };
}

describe("validateWorkspaceCutoverTargets", () => {
  it("accepts a complete uniquely-owned target without writing", async () => {
    const source = project("workspace-a", "/repo/a");
    const loadWorkspace = vi.fn(async () => workspace(source, encodeProjectPath(source.path)));
    const loadFolder = vi.fn(async () => folder(source));

    await expect(
      validateWorkspaceCutoverTargets({
        listLegacyProjects: async () => [source],
        loadWorkspace,
        loadFolder,
      })
    ).resolves.toEqual([]);
    expect(loadWorkspace).toHaveBeenCalledOnce();
    expect(loadFolder).toHaveBeenCalledOnce();
  });

  it("reports workspace then folder issues in stable project order", async () => {
    const first = project("workspace-a", "/repo/a");
    const second = project("workspace-b", "/repo/b");

    await expect(
      validateWorkspaceCutoverTargets({
        listLegacyProjects: async () => [first, second],
        loadWorkspace: async (id) =>
          id === first.id ? null : workspace(second, encodeProjectPath(second.path)),
        loadFolder: async (id) => (id === first.id ? null : folder(second)),
      })
    ).resolves.toMatchObject([
      { type: "workspace-target", workspaceId: first.id },
      { type: "folder-target", workspaceId: first.id },
    ]);
  });

  it("requires collision targets to omit provenance", async () => {
    const first = project("workspace-a", "/repo/a/b");
    const second = project("workspace-b", "/repo/a-b");
    expect(encodeProjectPath(first.path)).toBe(encodeProjectPath(second.path));

    await expect(
      validateWorkspaceCutoverTargets({
        listLegacyProjects: async () => [first, second],
        loadWorkspace: async (id) =>
          id === first.id ? workspace(first) : workspace(second, encodeProjectPath(second.path)),
        loadFolder: async (id) => folder(id === first.id ? first : second),
      })
    ).resolves.toMatchObject([{ type: "workspace-target", workspaceId: second.id }]);
  });

  it("reports malformed target reads without hiding later folder failures", async () => {
    const source = project("workspace-a", "/repo/a");

    await expect(
      validateWorkspaceCutoverTargets({
        listLegacyProjects: async () => [source],
        loadWorkspace: async () => {
          throw new Error("bad workspace json");
        },
        loadFolder: async () => {
          throw new Error("bad folder json");
        },
      })
    ).resolves.toEqual([
      {
        type: "workspace-target",
        workspaceId: source.id,
        message: "bad workspace json",
      },
      { type: "folder-target", workspaceId: source.id, message: "bad folder json" },
    ]);
  });
});
