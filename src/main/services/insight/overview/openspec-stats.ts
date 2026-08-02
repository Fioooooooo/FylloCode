import { promises as fs } from "fs";
import { join } from "path";
import { scanGuidelines } from "@main/infra/guidelines/scan-guidelines";

export type ArchiveCounts = {
  total: number;
  thisMonth: number;
};

function currentMonthPrefix(): string {
  // `yyyy-MM` prefix used to match archive directory names like `2026-07-11-change-slug`.
  return new Date().toISOString().slice(0, 7);
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function countSpecs(projectPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(join(projectPath, "openspec", "specs"), {
      withFileTypes: true,
    });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch (error) {
    if (isMissingPathError(error)) return 0;
    throw error;
  }
}

export async function countArchives(projectPath: string): Promise<ArchiveCounts> {
  try {
    const monthPrefix = currentMonthPrefix();
    const entries = await fs.readdir(join(projectPath, "openspec", "changes", "archive"), {
      withFileTypes: true,
    });
    const directories = entries.filter((entry) => entry.isDirectory());
    return {
      total: directories.length,
      thisMonth: directories.filter((entry) => entry.name.startsWith(monthPrefix)).length,
    };
  } catch (error) {
    if (isMissingPathError(error)) return { total: 0, thisMonth: 0 };
    throw error;
  }
}

export async function countGuidelines(projectPath: string): Promise<number> {
  try {
    return (await scanGuidelines(projectPath)).length;
  } catch (error) {
    if (isMissingPathError(error)) return 0;
    throw error;
  }
}
