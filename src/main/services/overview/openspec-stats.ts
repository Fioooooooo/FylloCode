import { promises as fs } from "fs";
import { join } from "path";
import { scanGuidelines } from "@main/infra/guidelines/scan-guidelines";

export type ArchiveCounts = {
  total: number;
  thisMonth: number;
};

function currentMonthPrefix(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function countSpecs(projectPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(join(projectPath, "openspec", "specs"), {
      withFileTypes: true,
    });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
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
  } catch {
    return { total: 0, thisMonth: 0 };
  }
}

export async function countGuidelines(projectPath: string): Promise<number> {
  try {
    return (await scanGuidelines(projectPath)).length;
  } catch {
    return 0;
  }
}
