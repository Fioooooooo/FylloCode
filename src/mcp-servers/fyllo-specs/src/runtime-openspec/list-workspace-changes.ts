import { listReadableWorkspaces } from "../runtime-workspace";
import { listChanges } from "./list";
import type { WorkspaceAwareChangeSummary } from "./types";

export interface WorkspaceChangesResult {
  activeChanges: WorkspaceAwareChangeSummary[];
  warnings: string[];
}

export async function listWorkspaceChanges(
  mainProjectPath: string
): Promise<WorkspaceChangesResult> {
  const { workspaces, warnings } = await listReadableWorkspaces(mainProjectPath);
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
          ...change,
          workspacePath: workspace.path,
          workspaceMode: workspace.mode,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to list changes for workspace ${workspace.path}: ${message}`);
    }
  }

  return { activeChanges, warnings };
}
