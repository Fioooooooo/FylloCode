import { promises as fs } from "fs";
import { basename } from "path";
import { nanoid } from "nanoid";
import { listFolders, saveFolder } from "@main/infra/storage/folder-store";
import type { FolderMeta } from "@shared/types/workspace";

export type FolderRegistryErrorCode = "FOLDER_PATH_UNAVAILABLE" | "FOLDER_CANONICAL_PATH_CONFLICT";

export class FolderRegistryError extends Error {
  constructor(
    public readonly code: FolderRegistryErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "FolderRegistryError";
  }
}

export interface FolderRegistryDependencies {
  listFolders(): Promise<FolderMeta[]>;
  saveFolder(meta: FolderMeta): Promise<void>;
  realpath(path: string): Promise<string>;
  createId(): string;
}

const defaultDependencies: FolderRegistryDependencies = {
  listFolders,
  saveFolder,
  realpath: (path) => fs.realpath(path),
  createId: () => nanoid(),
};

export class FolderRegistryService {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: FolderRegistryDependencies = defaultDependencies) {}

  async resolveOrCreateFolder(requestedPath: string, requestedName?: string): Promise<FolderMeta> {
    let canonicalPath: string;
    try {
      canonicalPath = await this.dependencies.realpath(requestedPath);
    } catch (error) {
      throw new FolderRegistryError("FOLDER_PATH_UNAVAILABLE", "Folder path is unavailable", {
        requestedPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    return this.withMutationLock(async () => {
      const folders = await this.dependencies.listFolders();
      const canonicalIndex = new Map<string, FolderMeta>();

      for (const folder of folders) {
        let existingCanonicalPath: string;
        try {
          existingCanonicalPath = await this.dependencies.realpath(folder.path);
        } catch {
          continue;
        }

        const conflict = canonicalIndex.get(existingCanonicalPath);
        if (conflict && conflict.id !== folder.id) {
          throw new FolderRegistryError(
            "FOLDER_CANONICAL_PATH_CONFLICT",
            "Multiple Folder records resolve to the same canonical path",
            {
              canonicalPath: existingCanonicalPath,
              folderIds: [conflict.id, folder.id],
            }
          );
        }
        canonicalIndex.set(existingCanonicalPath, folder);
      }

      const existing = canonicalIndex.get(canonicalPath);
      if (existing) return existing;

      const folder: FolderMeta = {
        version: 1,
        id: this.dependencies.createId(),
        name: requestedName?.trim() || basename(canonicalPath),
        path: canonicalPath,
      };
      await this.dependencies.saveFolder(folder);
      return folder;
    });
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release: () => void = () => {};
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export const folderRegistryService = new FolderRegistryService();
