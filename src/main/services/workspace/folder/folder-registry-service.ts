import { promises as fs } from "fs";
import { basename } from "path";
import { nanoid } from "nanoid";
import { listFolders, saveFolder } from "@main/infra/storage/folder-store";
import { listWorkspaces } from "@main/infra/storage/workspace-store";
import { getFolderPathRelation } from "@main/domain/workspace/model";
import { inspectWorkspaceFolderReferences } from "@main/services/workspace/workspace/workspace-reference-inspector";
import type {
  FolderMeta,
  FolderRelocationConflictReport,
  WorkspaceFolderReferenceImpact,
  WorkspaceMeta,
} from "@shared/types/workspace";

export type FolderRegistryErrorCode =
  | "FOLDER_PATH_UNAVAILABLE"
  | "FOLDER_CANONICAL_PATH_CONFLICT"
  | "FOLDER_NOT_FOUND"
  | "FOLDER_RELOCATION_CONFLICT"
  | "FOLDER_RELOCATION_ACTIVE_RUNTIME"
  | "FOLDER_RELOCATION_CONFIRMATION_REQUIRED";

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
  listWorkspaces(): Promise<WorkspaceMeta[]>;
  saveFolder(meta: FolderMeta): Promise<void>;
  realpath(path: string): Promise<string>;
  createId(): string;
  inspectReferences(workspaceId: string, folderId: string): Promise<WorkspaceFolderReferenceImpact>;
}

const defaultDependencies: FolderRegistryDependencies = {
  listFolders,
  listWorkspaces,
  saveFolder,
  realpath: (path) => fs.realpath(path),
  createId: () => nanoid(),
  inspectReferences: inspectWorkspaceFolderReferences,
};

export class FolderRegistryService {
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly dependencies: FolderRegistryDependencies;

  constructor(dependencies: Partial<FolderRegistryDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

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

  async relocateFolder(
    folderId: string,
    requestedPath: string,
    options: { confirmHistoricalSessions?: boolean } = {}
  ): Promise<FolderMeta> {
    let canonicalPath: string;
    try {
      canonicalPath = await this.dependencies.realpath(requestedPath);
    } catch (error) {
      throw new FolderRegistryError("FOLDER_PATH_UNAVAILABLE", "Folder path is unavailable", {
        folderId,
        requestedPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    return this.withMutationLock(async () => {
      const [folders, workspaces] = await Promise.all([
        this.dependencies.listFolders(),
        this.dependencies.listWorkspaces(),
      ]);
      const target = folders.find((folder) => folder.id === folderId);
      if (!target) {
        throw new FolderRegistryError("FOLDER_NOT_FOUND", "Folder was not found", { folderId });
      }

      const occupiedByFolder = await this.findFolderByCanonicalPath(
        folders,
        canonicalPath,
        folderId
      );
      const workspaceConflicts: FolderRelocationConflictReport["workspaceConflicts"] = [];
      const referencingWorkspaces = workspaces.filter((workspace) =>
        workspace.folderIds.includes(folderId)
      );

      for (const workspace of referencingWorkspaces) {
        for (const conflictingFolderId of workspace.folderIds) {
          if (conflictingFolderId === folderId) continue;
          const conflictingFolder = folders.find((folder) => folder.id === conflictingFolderId);
          if (!conflictingFolder) continue;
          let conflictingCanonicalPath: string;
          try {
            conflictingCanonicalPath = await this.dependencies.realpath(conflictingFolder.path);
          } catch {
            continue;
          }
          const relation = getFolderPathRelation(canonicalPath, conflictingCanonicalPath);
          if (!relation) continue;
          workspaceConflicts.push({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            conflictingFolderId: conflictingFolder.id,
            conflictingFolderName: conflictingFolder.name,
            conflictingFolderPath: conflictingCanonicalPath,
            relation,
          });
        }
      }

      if (occupiedByFolder || workspaceConflicts.length > 0) {
        const report: FolderRelocationConflictReport = {
          folderId,
          requestedCanonicalPath: canonicalPath,
          ...(occupiedByFolder
            ? {
                occupiedByFolder: {
                  folderId: occupiedByFolder.id,
                  folderName: occupiedByFolder.name,
                  folderPath: occupiedByFolder.path,
                },
              }
            : {}),
          workspaceConflicts,
        };
        throw new FolderRegistryError(
          "FOLDER_RELOCATION_CONFLICT",
          "Folder relocation conflicts with the current registry",
          { report }
        );
      }

      const impacts = await Promise.all(
        referencingWorkspaces.map((workspace) =>
          this.dependencies.inspectReferences(workspace.id, folderId)
        )
      );
      const activeReferences = impacts.flatMap((impact) => impact.activeReferences);
      const historicalSessions = impacts.flatMap((impact) => impact.historicalSessions);
      if (activeReferences.length > 0) {
        throw new FolderRegistryError(
          "FOLDER_RELOCATION_ACTIVE_RUNTIME",
          "Folder is used by active Workspace runtime",
          { folderId, activeReferences }
        );
      }
      if (historicalSessions.length > 0 && !options.confirmHistoricalSessions) {
        throw new FolderRegistryError(
          "FOLDER_RELOCATION_CONFIRMATION_REQUIRED",
          "Historical Sessions will keep the previous Folder path",
          { folderId, historicalSessions }
        );
      }

      const relocated = { ...target, path: canonicalPath };
      await this.dependencies.saveFolder(relocated);
      return relocated;
    });
  }

  private async findFolderByCanonicalPath(
    folders: readonly FolderMeta[],
    canonicalPath: string,
    excludedFolderId: string
  ): Promise<FolderMeta | null> {
    for (const folder of folders) {
      if (folder.id === excludedFolderId) continue;
      try {
        if ((await this.dependencies.realpath(folder.path)) === canonicalPath) return folder;
      } catch {
        // Missing Folder paths are not part of the canonical reverse index.
      }
    }
    return null;
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
