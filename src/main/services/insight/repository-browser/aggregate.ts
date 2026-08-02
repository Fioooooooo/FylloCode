import type {
  RepositoryAggregate,
  RepositoryFolderResult,
  RepositoryItemWarning,
} from "@shared/types/repository-browser";
import type { ResolvedWorkspace, ResolvedWorkspaceFolder } from "@shared/types/workspace";

export interface RepositoryLeafReadResult<T> {
  items: T[];
  warnings?: RepositoryItemWarning[];
}

export type RepositoryLeafReader<T> = (
  folder: ResolvedWorkspaceFolder
) => Promise<RepositoryLeafReadResult<T>>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function missingFolderResult<T>(
  folder: ResolvedWorkspaceFolder,
  primaryFolderId: string
): RepositoryFolderResult<T> {
  return {
    folderId: folder.folderId,
    folderName: folder.folderName,
    folderPath: folder.folderPath,
    isPrimary: folder.folderId === primaryFolderId,
    status: "missing",
    items: [],
    warnings: [],
  };
}

async function readFolder<T>(
  folder: ResolvedWorkspaceFolder,
  primaryFolderId: string,
  reader: RepositoryLeafReader<T>
): Promise<RepositoryFolderResult<T>> {
  if (folder.pathMissing) {
    return missingFolderResult(folder, primaryFolderId);
  }

  try {
    const result = await reader(folder);
    return {
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderPath: folder.folderPath,
      isPrimary: folder.folderId === primaryFolderId,
      status: "ready",
      items: result.items,
      warnings: result.warnings ?? [],
    };
  } catch (error) {
    return {
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderPath: folder.folderPath,
      isPrimary: folder.folderId === primaryFolderId,
      status: "error",
      items: [],
      warnings: [],
      error: toErrorMessage(error),
    };
  }
}

export async function aggregateWorkspaceRepositories<T>(
  workspace: Pick<ResolvedWorkspace, "primaryFolderId" | "folders">,
  reader: RepositoryLeafReader<T>
): Promise<RepositoryAggregate<T>> {
  const folders = await Promise.all(
    workspace.folders.map((folder) => readFolder(folder, workspace.primaryFolderId, reader))
  );
  const excludedFolderIds = folders
    .filter((folder) => folder.status !== "ready")
    .map((folder) => folder.folderId);

  return {
    folders,
    items: folders.flatMap((folder) => (folder.status === "ready" ? folder.items : [])),
    completeness: excludedFolderIds.length === 0 ? "complete" : "partial",
    excludedFolderIds,
  };
}
