import { promises as fs } from "fs";
import { join } from "path";
import { scanGuidelines } from "@main/infra/guidelines/scan-guidelines";
import type { GuidelineBrowserItem, GuidelinesBrowserOverview } from "@shared/types/guidelines";

const frontmatterRegex = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function stripFrontmatter(content: string): string {
  return content.replace(frontmatterRegex, "");
}

function toReadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readGuidelineItem(
  projectPath: string,
  metadata: Awaited<ReturnType<typeof scanGuidelines>>[number]
): Promise<GuidelineBrowserItem> {
  const absolutePath = join(projectPath, metadata.path);

  try {
    const [stat, content] = await Promise.all([
      fs.stat(absolutePath),
      fs.readFile(absolutePath, "utf8"),
    ]);

    return {
      ...metadata,
      updatedAt: stat.mtime.toISOString(),
      content: stripFrontmatter(content),
    };
  } catch (error) {
    return {
      ...metadata,
      updatedAt: "",
      content: "",
      parseError: metadata.parseError ?? toReadError(error),
    };
  }
}

export async function getGuidelinesBrowser(
  projectPath: string
): Promise<GuidelinesBrowserOverview> {
  const guidelines = await scanGuidelines(projectPath);
  const items = await Promise.all(
    guidelines.map((guideline) => readGuidelineItem(projectPath, guideline))
  );

  return { items };
}
