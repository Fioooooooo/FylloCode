import { mcpEventsDir, workspaceDataDir } from "@main/infra/storage/workspace-paths";
import type { WorkspaceKind, SessionWorkspaceSnapshot } from "@shared/types/workspace";
import {
  parseMcpWorkspaceDescriptor,
  type McpFolderEntry,
  type McpWorkspaceDescriptorV2,
} from "@shared/types/mcp-workspace";
import { assertSessionWorkspaceSnapshotCurrent } from "./session-workspace-service";

export interface McpWorkspaceDescriptorDependencies {
  assertSnapshotCurrent(snapshot: SessionWorkspaceSnapshot): Promise<SessionWorkspaceSnapshot>;
  resolveWorkspaceDataDir(workspaceId: string): string;
  resolveMcpEventsDir(workspaceId: string): string;
}

const defaultDependencies: McpWorkspaceDescriptorDependencies = {
  assertSnapshotCurrent: assertSessionWorkspaceSnapshotCurrent,
  resolveWorkspaceDataDir: workspaceDataDir,
  resolveMcpEventsDir: mcpEventsDir,
};

interface DescriptorProjectionInput {
  workspaceId: string;
  workspaceKind: WorkspaceKind;
  primaryFolderId: string;
  folders: McpFolderEntry[];
  sessionId?: string;
}

function projectDescriptor(
  input: DescriptorProjectionInput,
  dependencies: McpWorkspaceDescriptorDependencies
): McpWorkspaceDescriptorV2 {
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId: input.workspaceId,
    workspaceKind: input.workspaceKind,
    primaryFolderId: input.primaryFolderId,
    folders: input.folders,
    workspaceDataDir: dependencies.resolveWorkspaceDataDir(input.workspaceId),
    mcpEventDir: dependencies.resolveMcpEventsDir(input.workspaceId),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });
}

export async function createSessionMcpWorkspaceDescriptor(
  snapshot: SessionWorkspaceSnapshot,
  sessionId?: string,
  dependencies: McpWorkspaceDescriptorDependencies = defaultDependencies
): Promise<McpWorkspaceDescriptorV2> {
  const currentSnapshot = await dependencies.assertSnapshotCurrent(snapshot);
  return projectDescriptor(
    {
      workspaceId: currentSnapshot.workspaceId,
      workspaceKind: currentSnapshot.workspaceKind,
      primaryFolderId: currentSnapshot.primaryFolderId,
      folders: currentSnapshot.folders,
      ...(sessionId ? { sessionId } : {}),
    },
    dependencies
  );
}

export function createOwnerMcpWorkspaceDescriptor(
  input: {
    workspaceId: string;
    workspaceKind: WorkspaceKind;
    ownerFolder: McpFolderEntry;
    sessionId?: string;
  },
  dependencies: Omit<
    McpWorkspaceDescriptorDependencies,
    "assertSnapshotCurrent"
  > = defaultDependencies
): McpWorkspaceDescriptorV2 {
  return projectDescriptor(
    {
      workspaceId: input.workspaceId,
      workspaceKind: input.workspaceKind,
      primaryFolderId: input.ownerFolder.folderId,
      folders: [input.ownerFolder],
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    },
    { ...defaultDependencies, ...dependencies }
  );
}
