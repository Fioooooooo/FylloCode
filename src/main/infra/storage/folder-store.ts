import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import { folderDataDir } from "@main/infra/storage/workspace-paths";
import { validateFolderMeta } from "@main/domain/workspace/model";
import type { FolderMeta } from "@shared/types/workspace";

export function foldersDir(): string {
  return getDataSubPath("workspace-folders");
}

export function folderDir(folderId: string): string {
  return folderDataDir(folderId);
}

export function folderMetaPath(folderId: string): string {
  return join(folderDir(folderId), "meta.json");
}

export async function saveFolder(meta: FolderMeta): Promise<void> {
  const validated = validateFolderMeta(meta);
  writeFileAtomicSync(folderMetaPath(validated.id), JSON.stringify(validated, null, 2));
}

export async function loadFolder(folderId: string): Promise<FolderMeta | null> {
  try {
    const raw = await fs.readFile(folderMetaPath(folderId), "utf8");
    return validateFolderMeta(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listFolders(): Promise<FolderMeta[]> {
  try {
    const entries = await fs.readdir(foldersDir(), { withFileTypes: true });
    const metas = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => loadFolder(entry.name))
    );
    return metas.filter((meta): meta is FolderMeta => meta !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
