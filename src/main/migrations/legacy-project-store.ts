import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { legacyProjectDataPath } from "@main/migrations/legacy-project-path";
import { assertStorageIdentity } from "@main/infra/storage/workspace-paths";
import type { LegacyProjectMeta } from "@shared/types/project";

export function legacyProjectsDir(): string {
  return getDataSubPath("projects");
}

export function legacyProjectMetaPath(projectId: string): string {
  return join(legacyProjectsDir(), projectId, "meta.json");
}

function parseLegacyProjectMeta(raw: string): LegacyProjectMeta {
  const value = JSON.parse(raw) as Partial<LegacyProjectMeta>;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.path !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.lastOpenedAt !== "string"
  ) {
    throw new TypeError("legacy Project metadata is invalid");
  }
  return value as LegacyProjectMeta;
}

export async function loadLegacyProject(projectId: string): Promise<LegacyProjectMeta | null> {
  try {
    return parseLegacyProjectMeta(await fs.readFile(legacyProjectMetaPath(projectId), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listLegacyProjects(): Promise<LegacyProjectMeta[]> {
  try {
    const entries = await fs.readdir(legacyProjectsDir(), { withFileTypes: true });
    const records = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => loadLegacyProject(entry.name))
    );
    return records.filter((record): record is LegacyProjectMeta => record !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function assertLegacyProjectAppDataKey(legacyAppDataKey: string): void {
  legacyProjectDataPath(legacyAppDataKey);
}

export async function deleteLegacyProjectDataByAppDataKey(legacyAppDataKey: string): Promise<void> {
  await fs.rm(legacyProjectDataPath(legacyAppDataKey), { recursive: true, force: true });
}

export async function deleteLegacyProjectMetaRecord(projectId: string): Promise<void> {
  assertStorageIdentity(projectId, "Workspace");
  const directory = join(legacyProjectsDir(), projectId);
  await fs.rm(legacyProjectMetaPath(projectId), { force: true });
  try {
    await fs.rmdir(directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
  }
}
