import { existsSync, realpathSync } from "fs";
import path from "path";
import { runGit } from "./git";
import type { ReadableWorkspaceInfo, ReadableWorkspacesResult } from "./types";

function normalizePathForComparison(value: string): string {
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    return resolved;
  }
  return realpathSync.native(resolved);
}

function parseWorktreeListPorcelain(stdout: string, mainPath: string): ReadableWorkspaceInfo[] {
  const entries: ReadableWorkspaceInfo[] = [];
  const blocks = stdout.split(/\n(?=worktree )/);

  for (const block of blocks) {
    const worktreeLine = block.split("\n").find((line) => line.startsWith("worktree "));
    if (!worktreeLine) continue;

    const worktreePath = normalizePathForComparison(worktreeLine.slice("worktree ".length).trim());
    const isMain = worktreePath === mainPath;
    entries.push({
      mode: isMain ? "main" : "linked",
      path: worktreePath,
    });
  }

  return entries;
}

export async function listReadableWorkspaces(
  mainProjectPath: string
): Promise<ReadableWorkspacesResult> {
  const mainPath = normalizePathForComparison(mainProjectPath);
  const warnings: string[] = [];

  const result = await runGit(mainPath, ["worktree", "list", "--porcelain"]);

  if (result.exitCode === 0) {
    const workspaces = parseWorktreeListPorcelain(result.stdout, mainPath);
    // If git returned no entries, fall back to main workspace with a warning.
    if (workspaces.length === 0) {
      warnings.push(
        `git worktree list returned no worktrees for ${mainPath}; using main workspace.`
      );
      return {
        workspaces: [{ mode: "main", path: mainPath }],
        warnings,
      };
    }

    // Ensure the main workspace is present and uses the requested main path.
    const mainIndex = workspaces.findIndex((w) => w.mode === "main");
    if (mainIndex >= 0) {
      workspaces[mainIndex]!.path = mainPath;
    } else {
      workspaces.unshift({ mode: "main", path: mainPath });
    }

    return { workspaces, warnings };
  }

  warnings.push(
    `git worktree list failed for ${mainPath}: ${result.stderr.trim() || result.stdout.trim() || "unknown error"}; using main workspace.`
  );
  return {
    workspaces: [{ mode: "main", path: mainPath }],
    warnings,
  };
}
