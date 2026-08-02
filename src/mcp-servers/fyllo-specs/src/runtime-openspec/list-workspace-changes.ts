import { listReadableWorkspaces } from "../runtime-workspace";
import { resolveFolder, resolveWorkspace } from "../../../shared/workspace-resolver";
import { listChanges } from "./list";
import type { McpFolderEntry } from "@shared/types/mcp-workspace";
import type { WorkspaceAwareChangeSummary, WorkspaceChangeWarning } from "./types";

export interface WorkspaceChangesResult {
  activeChanges: WorkspaceAwareChangeSummary[];
  warnings: WorkspaceChangeWarning[];
}

async function scanFolder(folder: McpFolderEntry): Promise<WorkspaceAwareChangeSummary[]> {
  const { workspaces, warnings } = await listReadableWorkspaces(folder.folderPath);
  if (warnings.length > 0) {
    throw new Error(warnings.join(" "));
  }
  const activeChanges: WorkspaceAwareChangeSummary[] = [];
  const seenNames = new Set<string>();

  // Process linked worktrees first so duplicate names prefer linked entries.
  const orderedWorkspaces = [
    ...workspaces.filter((w) => w.mode === "linked"),
    ...workspaces.filter((w) => w.mode === "main"),
  ];

  for (const workspace of orderedWorkspaces) {
    try {
      const changes = await listChanges(workspace.path);
      for (const change of changes) {
        if (seenNames.has(change.name)) continue;
        seenNames.add(change.name);
        activeChanges.push({
          folderId: folder.folderId,
          folderName: folder.folderName,
          changeId: change.name,
          completedTasks: change.completedTasks,
          totalTasks: change.totalTasks,
          lastModified: change.lastModified,
          status: change.status,
          worktreePath: workspace.path,
          worktreeMode: workspace.mode,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list changes for worktree ${workspace.path}: ${message}`);
    }
  }

  return activeChanges;
}

export async function listWorkspaceChanges(folderId?: string): Promise<WorkspaceChangesResult> {
  const folders = folderId ? [resolveFolder(folderId)] : resolveWorkspace().folders;
  const results = await Promise.all(
    folders.map(async (folder) => {
      try {
        return { changes: await scanFolder(folder), warning: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          changes: [],
          warning: {
            folderId: folder.folderId,
            code: "PROPOSAL_FOLDER_SCAN_FAILED",
            message,
          } satisfies WorkspaceChangeWarning,
        };
      }
    })
  );

  return {
    activeChanges: results.flatMap((result) => result.changes),
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
  };
}
