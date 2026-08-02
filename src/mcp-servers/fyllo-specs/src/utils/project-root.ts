import {
  resolveSingleFolder,
  validateWorktree,
  worktreeGitChildProcess,
} from "../../../shared/workspace-resolver";

export const gitChildProcess = worktreeGitChildProcess;

export interface TargetPathValidationResult {
  ok: boolean;
  resolved?: string;
  rawOutput?: string;
  error?: string;
}

export function resolveProjectRoot(): string {
  return resolveSingleFolder().folderPath;
}

export function validateTargetPath(targetPath: string): TargetPathValidationResult {
  try {
    const owner = resolveSingleFolder();
    return {
      ok: true,
      resolved: validateWorktree(owner.folderId, targetPath),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
