import { spawnSync } from "child_process";
import path from "path";

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
  spawnSync,
};

export function validateTargetPath(targetPath: string): TargetPathValidationResult {
  if (!path.isAbsolute(targetPath)) {
    return { ok: false, error: "targetPath must be an absolute path" };
  }

  const resolved = path.resolve(targetPath);
  const projectRoot = path.resolve(process.env.FYLLO_PROJECT_PATH ?? "");
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
        .map((line) => path.resolve(line.slice("worktree ".length).trim()))
    );

    if (worktreePaths.has(resolved)) {
      return { ok: true, resolved };
    }

    return {
      ok: false,
      rawOutput: result.stdout ?? "",
      error: "targetPath is not a registered git worktree",
    };
  }

  if (resolved === projectRoot) {
    return { ok: true, resolved };
  }

  return {
    ok: false,
    rawOutput: result.stderr ?? result.error?.message ?? "",
    error: "targetPath must be the project root for non-git projects",
  };
}
