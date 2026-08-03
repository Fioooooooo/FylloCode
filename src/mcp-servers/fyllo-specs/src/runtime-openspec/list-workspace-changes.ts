import { listReadableWorkspaces } from "../runtime-workspace";
import { resolveFolder, resolveWorkspace } from "../../../shared/workspace-resolver";
import { listChanges } from "./list";
import type { McpFolderEntry } from "@shared/types/mcp-workspace";
import type { WorkspaceAwareChangeSummary, WorkspaceChangeWarning } from "./types";

export interface WorkspaceChangesResult {
  activeChanges: WorkspaceAwareChangeSummary[];
  warnings: WorkspaceChangeWarning[];
}

interface FolderScanResult {
  changes: WorkspaceAwareChangeSummary[];
  failures: string[];
}

async function scanFolder(folder: McpFolderEntry): Promise<FolderScanResult> {
  const { workspaces, warnings } = await listReadableWorkspaces(folder.folderPath);
  if (warnings.length > 0) {
    throw new Error(warnings.join(" "));
  }
  const activeChanges: WorkspaceAwareChangeSummary[] = [];
  const failures: string[] = [];
  const seenNames = new Set<string>();

  // linked 优先，确保 main 与 linked 同名时保留 Proposal 的实际执行位置。
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
      // 单个 worktree 未初始化 OpenSpec 时，不得隐藏同一 Folder 中其他可读 Proposal。
      failures.push(`Failed to list changes for worktree ${workspace.path}: ${message}`);
    }
  }

  return { changes: activeChanges, failures };
}

export async function listWorkspaceChanges(folderId?: string): Promise<WorkspaceChangesResult> {
  const folders = folderId ? [resolveFolder(folderId)] : resolveWorkspace().folders;
  const results = await Promise.all(
    folders.map(async (folder) => {
      try {
        const scan = await scanFolder(folder);
        return {
          changes: scan.changes,
          warning:
            scan.failures.length > 0
              ? ({
                  folderId: folder.folderId,
                  code: "PROPOSAL_FOLDER_SCAN_FAILED",
                  message: scan.failures.join(" "),
                } satisfies WorkspaceChangeWarning)
              : null,
        };
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
