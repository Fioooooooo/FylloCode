import { describe, expect, it, vi } from "vitest";
import {
  FolderRegistryService,
  type FolderRegistryDependencies,
} from "@main/services/workspace/folder/folder-registry-service";
import type { FolderMeta } from "@shared/types/workspace";

function createFixture(initial: FolderMeta[] = []) {
  const folders = [...initial];
  const canonicalPaths = new Map<string, string>();
  const dependencies: FolderRegistryDependencies = {
    listFolders: vi.fn(async () => [...folders]),
    saveFolder: vi.fn(async (folder) => {
      folders.push(folder);
    }),
    realpath: vi.fn(async (path) => {
      const canonical = canonicalPaths.get(path);
      if (!canonical) throw new Error(`missing: ${path}`);
      return canonical;
    }),
    createId: vi.fn(() => `folder-${folders.length + 1}`),
  };
  return {
    folders,
    canonicalPaths,
    dependencies,
    service: new FolderRegistryService(dependencies),
  };
}

describe("FolderRegistryService", () => {
  it("creates a path-independent Folder ID and stores the canonical path", async () => {
    const fixture = createFixture();
    fixture.canonicalPaths.set("/alias/repo", "/work/repo");

    await expect(fixture.service.resolveOrCreateFolder("/alias/repo")).resolves.toEqual({
      version: 1,
      id: "folder-1",
      name: "repo",
      path: "/work/repo",
    });
    expect(fixture.dependencies.saveFolder).toHaveBeenCalledOnce();
  });

  it("serializes concurrent resolution of the same canonical path", async () => {
    const fixture = createFixture();
    fixture.canonicalPaths.set("/work/repo", "/work/repo");
    fixture.canonicalPaths.set("/alias/repo", "/work/repo");

    const [first, second] = await Promise.all([
      fixture.service.resolveOrCreateFolder("/work/repo"),
      fixture.service.resolveOrCreateFolder("/alias/repo"),
    ]);

    expect(first.id).toBe(second.id);
    expect(fixture.folders).toHaveLength(1);
    expect(fixture.dependencies.saveFolder).toHaveBeenCalledOnce();
  });

  it("does not index a missing legacy Folder path", async () => {
    const fixture = createFixture([
      { version: 1, id: "legacy-folder", name: "Legacy", path: "/missing/repo" },
    ]);
    fixture.canonicalPaths.set("/work/repo", "/work/repo");

    const resolved = await fixture.service.resolveOrCreateFolder("/work/repo");
    expect(resolved.id).toBe("folder-2");
    expect(fixture.folders).toHaveLength(2);
  });

  it("rejects an already-corrupt canonical path index", async () => {
    const fixture = createFixture([
      { version: 1, id: "folder-1", name: "One", path: "/alias/one" },
      { version: 1, id: "folder-2", name: "Two", path: "/alias/two" },
    ]);
    fixture.canonicalPaths.set("/work/repo", "/work/repo");
    fixture.canonicalPaths.set("/alias/one", "/work/repo");
    fixture.canonicalPaths.set("/alias/two", "/work/repo");

    await expect(fixture.service.resolveOrCreateFolder("/work/repo")).rejects.toMatchObject({
      code: "FOLDER_CANONICAL_PATH_CONFLICT",
    });
    expect(fixture.dependencies.saveFolder).not.toHaveBeenCalled();
  });

  it("returns a structured error for an unavailable requested path", async () => {
    const fixture = createFixture();
    await expect(fixture.service.resolveOrCreateFolder("/missing")).rejects.toMatchObject({
      code: "FOLDER_PATH_UNAVAILABLE",
    });
  });
});
