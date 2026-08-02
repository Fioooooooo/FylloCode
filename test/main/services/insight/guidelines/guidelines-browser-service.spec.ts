import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGuidelinesBrowser } from "@main/services/insight/guidelines/guidelines-browser-service";
import type { ResolvedWorkspaceFolder } from "@shared/types/workspace";

let roots: string[];

async function createFolder(folderId: string): Promise<ResolvedWorkspaceFolder> {
  const folderPath = await fs.mkdtemp(join(tmpdir(), `fyllocode-guidelines-${folderId}-`));
  roots.push(folderPath);
  return { folderId, folderName: folderId.toUpperCase(), folderPath, pathMissing: false };
}

async function writeGuideline(
  folder: ResolvedWorkspaceFolder,
  relativePath: string,
  content: string,
  updatedAt = new Date("2026-06-20T10:00:00.000Z")
): Promise<void> {
  const absolutePath = join(folder.folderPath, relativePath);
  await fs.mkdir(join(absolutePath, ".."), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  await fs.utimes(absolutePath, updatedAt, updatedAt);
}

describe("guidelines-browser-service", () => {
  beforeEach(() => {
    roots = [];
  });

  afterEach(async () => {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("returns owner-qualified same-path guidelines from two Folders", async () => {
    const folderA = await createFolder("folder-a");
    const folderB = await createFolder("folder-b");
    const content = [
      "---",
      'name: "Architecture"',
      'description: "Top-level boundaries"',
      'keywords: ["architecture"]',
      "---",
      "# Architecture",
    ].join("\n");
    await writeGuideline(folderA, "guidelines/Architecture.md", content);
    await writeGuideline(folderB, "guidelines/Architecture.md", content);

    const result = await getGuidelinesBrowser({
      primaryFolderId: folderA.folderId,
      folders: [folderA, folderB],
    });

    expect(result.items.map(({ ref }) => ref)).toEqual([
      { folderId: "folder-a", path: "guidelines/Architecture.md" },
      { folderId: "folder-b", path: "guidelines/Architecture.md" },
    ]);
    expect(result.items[0]).toMatchObject({
      folderName: "FOLDER-A",
      name: "Architecture",
      content: "# Architecture",
    });
  });

  it("keeps invalid frontmatter as an owner-qualified warning", async () => {
    const member = await createFolder("folder-a");
    await writeGuideline(
      member,
      "guidelines/Bad.md",
      ["---", ": : :", "---", "# Bad", "", "Still readable."].join("\n")
    );

    const result = await getGuidelinesBrowser({
      primaryFolderId: member.folderId,
      folders: [member],
    });

    expect(result.items[0]).toMatchObject({
      ref: { folderId: "folder-a", path: "guidelines/Bad.md" },
      path: "guidelines/Bad.md",
      parseError: expect.any(String),
      content: "# Bad\n\nStill readable.",
    });
    expect(result.folders[0].warnings).toEqual([
      expect.objectContaining({ itemPath: "guidelines/Bad.md" }),
    ]);
  });

  it("returns ready-empty when guidelines directory is missing", async () => {
    const member = await createFolder("folder-a");

    const result = await getGuidelinesBrowser({
      primaryFolderId: member.folderId,
      folders: [member],
    });

    expect(result).toMatchObject({
      completeness: "complete",
      items: [],
      folders: [{ status: "ready", items: [] }],
    });
  });

  it("isolates a Folder scan error and preserves ready guidelines", async () => {
    const folderA = await createFolder("folder-a");
    const folderB = await createFolder("folder-b");
    await writeGuideline(folderA, "guidelines/Architecture.md", "# Architecture");
    await fs.writeFile(join(folderB.folderPath, "guidelines"), "not-a-directory", "utf8");

    const result = await getGuidelinesBrowser({
      primaryFolderId: folderA.folderId,
      folders: [folderA, folderB],
    });

    expect(result.items).toHaveLength(1);
    expect(result.folders[1].status).toBe("error");
    expect(result.completeness).toBe("partial");
  });

  it("keeps a missing Folder in the aggregate", async () => {
    const folderA = await createFolder("folder-a");
    const folderB: ResolvedWorkspaceFolder = {
      folderId: "folder-b",
      folderName: "FOLDER-B",
      folderPath: "/missing/folder-b",
      pathMissing: true,
    };

    const result = await getGuidelinesBrowser({
      primaryFolderId: folderA.folderId,
      folders: [folderA, folderB],
    });

    expect(result.folders[1]).toMatchObject({ folderId: "folder-b", status: "missing" });
  });
});
