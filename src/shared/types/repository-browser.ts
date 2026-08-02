export type RepositoryFolderStatus = "ready" | "missing" | "error";

export type RepositoryAggregateCompleteness = "complete" | "partial";

export interface RepositoryItemWarning {
  message: string;
  itemPath?: string;
}

export interface RepositoryFolderResult<T> {
  folderId: string;
  folderName: string;
  folderPath: string;
  isPrimary: boolean;
  status: RepositoryFolderStatus;
  items: T[];
  warnings: RepositoryItemWarning[];
  error?: string;
}

export interface RepositoryAggregate<T> {
  folders: RepositoryFolderResult<T>[];
  items: T[];
  completeness: RepositoryAggregateCompleteness;
  excludedFolderIds: string[];
}
