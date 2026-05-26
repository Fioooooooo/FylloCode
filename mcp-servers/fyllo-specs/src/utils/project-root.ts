import { existsSync, realpathSync } from "fs";
import path from "path";
import spawn from "cross-spawn";

export interface TargetPathValidationResult {
  ok: boolean;
  resolved?: string;
  rawOutput?: string;
  error?: string;
}

export function resolveProjectRoot(): string {
  return process.env.FYLLO_PROJECT_PATH || process.cwd();
}

export const gitChildProcess = {
  spawnSync: spawn.sync,
};

function normalizePathForComparison(value: string): string {
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    return resolved;
  }
  return realpathSync.native(resolved);
}

export function validateTargetPath(targetPath: string): TargetPathValidationResult {
  if (!path.isAbsolute(targetPath)) {
    return { ok: false, error: "targetPath must be an absolute path" };
  }

  const resolved = path.resolve(targetPath);
  const comparableResolved = normalizePathForComparison(resolved);
  const projectRoot = path.resolve(process.env.FYLLO_PROJECT_PATH ?? "");
  const comparableProjectRoot = normalizePathForComparison(projectRoot);
  const result = gitChildProcess.spawnSync(
    "git",
    ["-C", process.env.FYLLO_PROJECT_PATH ?? "", "worktree", "list", "--porcelain"],
    { encoding: "utf8" }
  );

  if (result.status === 0) {
    const worktreePaths = new Set(
      (result.stdout ?? "")
        .split("\n")
        .filter((line) => line.startsWith("worktree "))
        .map((line) => normalizePathForComparison(line.slice("worktree ".length).trim()))
    );

    if (worktreePaths.has(comparableResolved)) {
      return { ok: true, resolved };
    }

    return {
      ok: false,
      rawOutput: result.stdout ?? "",
      error: "targetPath is not a registered git worktree",
    };
  }

  if (comparableResolved === comparableProjectRoot) {
    return { ok: true, resolved };
  }

  return {
    ok: false,
    rawOutput: result.stderr ?? result.error?.message ?? "",
    error: "targetPath must be the project root for non-git projects",
  };
}
