import { describe, expect, it, vi } from "vitest";
import { aggregateWorkspaceRepositories } from "@main/services/insight/repository-browser/aggregate";
import type { ResolvedWorkspaceFolder } from "@shared/types/workspace";

function folder(
  folderId: string,
  options: Partial<ResolvedWorkspaceFolder> = {}
): ResolvedWorkspaceFolder {
  return {
    folderId,
    folderName: folderId.toUpperCase(),
    folderPath: `/repos/${folderId}`,
    pathMissing: false,
    ...options,
  };
}

describe("aggregateWorkspaceRepositories", () => {
  it("preserves member order and ready-empty results", async () => {
    const reader = vi.fn(async (member: ResolvedWorkspaceFolder) => ({
      items: member.folderId === "folder-a" ? [] : [member.folderId],
    }));

    const result = await aggregateWorkspaceRepositories(
      {
        primaryFolderId: "folder-b",
        folders: [folder("folder-a"), folder("folder-b")],
      },
      reader
    );

    expect(result.folders.map(({ folderId }) => folderId)).toEqual(["folder-a", "folder-b"]);
    expect(result.folders[0]).toMatchObject({ status: "ready", items: [], isPrimary: false });
    expect(result.folders[1]).toMatchObject({ status: "ready", isPrimary: true });
    expect(result.items).toEqual(["folder-b"]);
    expect(result.completeness).toBe("complete");
  });

  it("keeps missing Folders without invoking the leaf reader", async () => {
    const reader = vi.fn(async () => ({ items: ["unexpected"] }));

    const result = await aggregateWorkspaceRepositories(
      {
        primaryFolderId: "folder-a",
        folders: [folder("folder-a"), folder("folder-b", { pathMissing: true })],
      },
      reader
    );

    expect(reader).toHaveBeenCalledTimes(1);
    expect(result.folders[1]).toMatchObject({ status: "missing", items: [] });
    expect(result.excludedFolderIds).toEqual(["folder-b"]);
    expect(result.completeness).toBe("partial");
  });

  it("isolates thrown leaf errors and retains ready items", async () => {
    const result = await aggregateWorkspaceRepositories(
      {
        primaryFolderId: "folder-a",
        folders: [folder("folder-a"), folder("folder-b")],
      },
      async (member) => {
        if (member.folderId === "folder-b") throw new Error("permission denied");
        return { items: ["ready-item"] };
      }
    );

    expect(result.items).toEqual(["ready-item"]);
    expect(result.folders[1]).toMatchObject({
      status: "error",
      error: "permission denied",
      items: [],
    });
    expect(result.excludedFolderIds).toEqual(["folder-b"]);
  });

  it("preserves item warnings without making a Folder partial", async () => {
    const result = await aggregateWorkspaceRepositories(
      { primaryFolderId: "folder-a", folders: [folder("folder-a")] },
      async () => ({
        items: ["valid-item"],
        warnings: [{ message: "invalid item", itemPath: "broken.md" }],
      })
    );

    expect(result.folders[0]).toMatchObject({
      status: "ready",
      items: ["valid-item"],
      warnings: [{ message: "invalid item", itemPath: "broken.md" }],
    });
    expect(result.completeness).toBe("complete");
    expect(result.excludedFolderIds).toEqual([]);
  });
});
