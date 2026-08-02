import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSpecsBrowser } from "@main/services/insight/specs/specs-browser-service";
import type { ResolvedWorkspaceFolder } from "@shared/types/workspace";

let roots: string[];

async function createFolder(folderId: string): Promise<ResolvedWorkspaceFolder> {
  const folderPath = await fs.mkdtemp(join(tmpdir(), `fyllocode-specs-${folderId}-`));
  roots.push(folderPath);
  return { folderId, folderName: folderId.toUpperCase(), folderPath, pathMissing: false };
}

async function writeSpec(
  folder: ResolvedWorkspaceFolder,
  id: string,
  content: string,
  updatedAt = new Date("2026-06-20T10:00:00.000Z")
): Promise<void> {
  const specDir = join(folder.folderPath, "openspec", "specs", id);
  const specPath = join(specDir, "spec.md");
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(specPath, content, "utf8");
  await fs.utimes(specPath, updatedAt, updatedAt);
}

describe("specs-browser-service", () => {
  beforeEach(() => {
    roots = [];
  });

  afterEach(async () => {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("returns owner-qualified same-ID specs from two Folders", async () => {
    const folderA = await createFolder("folder-a");
    const folderB = await createFolder("folder-b");
    await writeSpec(folderA, "same-capability", "# A\n## Purpose\nFolder A spec.");
    await writeSpec(folderB, "same-capability", "# B\n## Purpose\nFolder B spec.");

    const result = await getSpecsBrowser({
      primaryFolderId: folderA.folderId,
      folders: [folderA, folderB],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.map(({ ref }) => ref)).toEqual([
      { folderId: "folder-a", specId: "same-capability" },
      { folderId: "folder-b", specId: "same-capability" },
    ]);
    expect(result.folders.map(({ status }) => status)).toEqual(["ready", "ready"]);
  });

  it("returns ready-empty when openspec specs directory is missing", async () => {
    const member = await createFolder("folder-a");

    const result = await getSpecsBrowser({
      primaryFolderId: member.folderId,
      folders: [member],
    });

    expect(result).toMatchObject({
      items: [],
      completeness: "complete",
      folders: [{ folderId: "folder-a", status: "ready", items: [] }],
    });
  });

  it("isolates an unreadable spec as an item warning", async () => {
    const member = await createFolder("folder-a");
    await fs.mkdir(join(member.folderPath, "openspec", "specs", "missing-spec"), {
      recursive: true,
    });
    await writeSpec(member, "available-spec", "# Available\n## Purpose\n可读能力规约。");

    const result = await getSpecsBrowser({
      primaryFolderId: member.folderId,
      folders: [member],
    });

    expect(result.items.map((item) => item.id)).toEqual(["available-spec"]);
    expect(result.folders[0].warnings).toEqual([
      expect.objectContaining({ itemPath: "openspec/specs/missing-spec/spec.md" }),
    ]);
    expect(result.completeness).toBe("complete");
  });

  it("marks a Folder error without discarding another Folder", async () => {
    const folderA = await createFolder("folder-a");
    const folderB = await createFolder("folder-b");
    await writeSpec(folderA, "available-spec", "# Available\n## Purpose\n可读能力规约。");
    await fs.mkdir(join(folderB.folderPath, "openspec"), { recursive: true });
    await fs.writeFile(join(folderB.folderPath, "openspec", "specs"), "not-a-directory", "utf8");

    const result = await getSpecsBrowser({
      primaryFolderId: folderA.folderId,
      folders: [folderA, folderB],
    });

    expect(result.items.map((item) => item.id)).toEqual(["available-spec"]);
    expect(result.folders[1].status).toBe("error");
    expect(result.completeness).toBe("partial");
    expect(result.excludedFolderIds).toEqual(["folder-b"]);
  });

  it("keeps missing Workspace members visible", async () => {
    const folderA = await createFolder("folder-a");
    const folderB: ResolvedWorkspaceFolder = {
      folderId: "folder-b",
      folderName: "FOLDER-B",
      folderPath: "/missing/folder-b",
      pathMissing: true,
    };

    const result = await getSpecsBrowser({
      primaryFolderId: folderA.folderId,
      folders: [folderA, folderB],
    });

    expect(result.folders[1]).toMatchObject({ folderId: "folder-b", status: "missing" });
  });
});
