import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { runGit } from "./git";
import { validateWorktree } from "../../../shared/workspace-resolver";
import type { ProposalWorktreeMode } from "@shared/types/proposal";
import type { PrepareProposalWorkspaceResult } from "./types";

async function isGitRepo(projectPath: string): Promise<boolean> {
  const result = await runGit(projectPath, ["rev-parse", "--is-inside-work-tree"]);
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

// 自动把 .worktrees/ 加入 .gitignore，避免 linked workspace 目录被误提交到主仓库。
function ensureWorktreesIgnored(mainProjectPath: string): void {
  const gitignorePath = path.join(mainProjectPath, ".gitignore");
  const line = ".worktrees/";
  const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (current.split(/\r?\n/).includes(line)) {
    return;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${current}${prefix}${line}\n`, "utf8");
}

export async function prepareProposalWorkspace(input: {
  folderId: string;
  folderPath: string;
  changeName: string;
  worktreeMode: ProposalWorktreeMode;
}): Promise<PrepareProposalWorkspaceResult> {
  const mainPath = path.resolve(input.folderPath);
  const warnings: string[] = [];

  if (!(await isGitRepo(mainPath))) {
    throw Object.assign(new Error("Proposal owner Folder must be a Git repository"), {
      name: "ProposalRepositoryInvalid",
    });
  }

  if (input.worktreeMode === "main") {
    return {
      workspace: { mode: "main", path: mainPath },
      warnings,
    };
  }

  try {
    ensureWorktreesIgnored(mainPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw Object.assign(new Error(`Failed to ensure .worktrees/ is ignored: ${message}`), {
      name: "WorkspaceRuntimeError",
    });
  }

  const worktreesDir = path.join(mainPath, ".worktrees");
  const workspacePath = path.join(worktreesDir, input.changeName);
  mkdirSync(worktreesDir, { recursive: true });

  if (existsSync(workspacePath)) {
    validateWorktree(input.folderId, workspacePath);
    warnings.push(`linked workspace already exists and will be reused: ${workspacePath}`);
    return {
      workspace: { mode: "linked", path: workspacePath },
      warnings,
    };
  }

  const result = await runGit(mainPath, [
    "worktree",
    "add",
    workspacePath,
    "-b",
    `proposal/${input.changeName}`,
  ]);

  if (result.exitCode !== 0) {
    throw Object.assign(
      new Error(
        [
          "Failed to create linked worktree.",
          `command: git worktree add ${workspacePath} -b proposal/${input.changeName}`,
          result.stderr.trim() ? `stderr: ${result.stderr.trim()}` : null,
          result.stdout.trim() ? `stdout: ${result.stdout.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      { name: "WorkspaceRuntimeError" }
    );
  }

  return {
    workspace: { mode: "linked", path: workspacePath },
    warnings,
  };
}
