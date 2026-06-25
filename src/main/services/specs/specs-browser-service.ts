import { promises as fs } from "fs";
import type { Dirent } from "fs";
import { join } from "path";
import type { SpecBrowserItem, SpecsBrowserOverview } from "@shared/types/specs";
import { parseSpecMarkdown } from "./specs-markdown-parser";

function sourcePathFor(id: string): string {
  return ["openspec", "specs", id, "spec.md"].join("/");
}

async function readSpecItem(projectPath: string, id: string): Promise<SpecBrowserItem | null> {
  const absolutePath = join(projectPath, "openspec", "specs", id, "spec.md");
  const sourcePath = sourcePathFor(id);

  try {
    const [stat, content] = await Promise.all([
      fs.stat(absolutePath),
      fs.readFile(absolutePath, "utf8"),
    ]);

    return parseSpecMarkdown(id, sourcePath, content, stat.mtime.toISOString());
  } catch {
    return null;
  }
}

function isSpecItem(item: SpecBrowserItem | null): item is SpecBrowserItem {
  return item !== null;
}

export async function getSpecsBrowser(projectPath: string): Promise<SpecsBrowserOverview> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(join(projectPath, "openspec", "specs"), {
      withFileTypes: true,
    });
  } catch {
    return { items: [] };
  }

  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const items = await Promise.all(ids.map((id) => readSpecItem(projectPath, id)));

  return {
    items: items.filter(isSpecItem),
  };
}
