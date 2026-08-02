import type { WorkspaceInfo } from "@shared/types/workspace";

interface WorkspaceFixtureInput {
  id?: string;
  name?: string;
  folderPath?: string;
  healthScore?: number;
  createdAt?: Date | string;
  lastOpenedAt?: Date | string;
  pathMissing?: boolean;
  kind?: "folder" | "collection";
  chatAvailable?: boolean;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function workspaceInfo(input: WorkspaceFixtureInput = {}): WorkspaceInfo {
  const id = input.id ?? "workspace-1";
  const pathMissing = input.pathMissing ?? false;
  const folder = {
    folderId: id,
    folderName: input.name ?? `Folder ${id}`,
    folderPath: input.folderPath ?? `/tmp/${id}`,
    pathMissing,
    isPrimary: true,
  };
  return {
    version: 2,
    id,
    name: input.name ?? `Workspace ${id}`,
    kind: input.kind ?? "folder",
    isDeleted: false,
    folderIds: [id],
    primaryFolderId: id,
    createdAt: toIsoString(input.createdAt ?? "2026-07-01T00:00:00.000Z"),
    lastOpenedAt: toIsoString(input.lastOpenedAt ?? "2026-07-01T00:00:00.000Z"),
    primaryFolder: {
      version: 1,
      id,
      name: input.name ?? `Folder ${id}`,
      path: input.folderPath ?? `/tmp/${id}`,
      ...(input.healthScore === undefined ? {} : { healthScore: input.healthScore }),
    },
    primaryFolderMetaPath: `/tmp/app-data/workspace-folders/${id}/meta.json`,
    pathMissing,
    folders: [folder],
    availableFolders: pathMissing ? [] : [folder],
    missingFolders: pathMissing ? [folder] : [],
    chatAvailable: input.chatAvailable ?? true,
  };
}
