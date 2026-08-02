import { promises as fs } from "fs";
import { join } from "path";
import { scanGuidelines } from "@main/infra/guidelines/scan-guidelines";
import type { GuidelineBrowserItem, GuidelinesBrowserOverview } from "@shared/types/guidelines";
import type { RepositoryItemWarning } from "@shared/types/repository-browser";
import type { ResolvedWorkspace, ResolvedWorkspaceFolder } from "@shared/types/workspace";
import { aggregateWorkspaceRepositories } from "@main/services/insight/repository-browser/aggregate";

const frontmatterRegex = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function stripFrontmatter(content: string): string {
  return content.replace(frontmatterRegex, "");
}

function toReadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readGuidelineItem(
  folder: ResolvedWorkspaceFolder,
  metadata: Awaited<ReturnType<typeof scanGuidelines>>[number]
): Promise<GuidelineBrowserItem> {
  const absolutePath = join(folder.folderPath, metadata.path);

  try {
    const [stat, content] = await Promise.all([
      fs.stat(absolutePath),
      fs.readFile(absolutePath, "utf8"),
    ]);

    return {
      ...metadata,
      ref: { folderId: folder.folderId, path: metadata.path },
      folderName: folder.folderName,
      updatedAt: stat.mtime.toISOString(),
      content: stripFrontmatter(content),
    };
  } catch (error) {
    return {
      ...metadata,
      ref: { folderId: folder.folderId, path: metadata.path },
      folderName: folder.folderName,
      updatedAt: "",
      content: "",
      parseError: metadata.parseError ?? toReadError(error),
    };
  }
}

export async function getGuidelinesBrowser(
  workspace: Pick<ResolvedWorkspace, "primaryFolderId" | "folders">
): Promise<GuidelinesBrowserOverview> {
  return aggregateWorkspaceRepositories(workspace, async (folder) => {
    const guidelines = await scanGuidelines(folder.folderPath);
    const items = await Promise.all(
      guidelines.map((guideline) => readGuidelineItem(folder, guideline))
    );
    const warnings: RepositoryItemWarning[] = items.flatMap((item) =>
      item.parseError ? [{ message: item.parseError, itemPath: item.path }] : []
    );

    return { items, warnings };
  });
}
