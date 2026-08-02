import { promises as fs } from "fs";
import type { Dirent } from "fs";
import { join } from "path";
import type { SpecBrowserItem, SpecsBrowserOverview } from "@shared/types/specs";
import type { RepositoryItemWarning } from "@shared/types/repository-browser";
import type { ResolvedWorkspace, ResolvedWorkspaceFolder } from "@shared/types/workspace";
import { parseSpecMarkdown } from "./specs-markdown-parser";
import { aggregateWorkspaceRepositories } from "@main/services/insight/repository-browser/aggregate";

function sourcePathFor(id: string): string {
  return ["openspec", "specs", id, "spec.md"].join("/");
}

async function readSpecItem(folder: ResolvedWorkspaceFolder, id: string): Promise<SpecBrowserItem> {
  const absolutePath = join(folder.folderPath, "openspec", "specs", id, "spec.md");
  const sourcePath = sourcePathFor(id);
  const [stat, content] = await Promise.all([
    fs.stat(absolutePath),
    fs.readFile(absolutePath, "utf8"),
  ]);
  const parsed = parseSpecMarkdown(id, sourcePath, content, stat.mtime.toISOString());
  return {
    ...parsed,
    ref: { folderId: folder.folderId, specId: id },
    folderName: folder.folderName,
  };
}

function isMissingDirectoryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readFolderSpecs(
  folder: ResolvedWorkspaceFolder
): Promise<{ items: SpecBrowserItem[]; warnings: RepositoryItemWarning[] }> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(join(folder.folderPath, "openspec", "specs"), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return { items: [], warnings: [] };
    }
    throw error;
  }

  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const settled = await Promise.allSettled(ids.map((id) => readSpecItem(folder, id)));
  const items: SpecBrowserItem[] = [];
  const warnings: RepositoryItemWarning[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(result.value);
      return;
    }

    warnings.push({
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      itemPath: sourcePathFor(ids[index]),
    });
  });

  return { items, warnings };
}

export async function getSpecsBrowser(
  workspace: Pick<ResolvedWorkspace, "primaryFolderId" | "folders">
): Promise<SpecsBrowserOverview> {
  return aggregateWorkspaceRepositories(workspace, readFolderSpecs);
}
