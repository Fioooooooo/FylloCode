import type { ChildProcessWithoutNullStreams } from "child_process";
import { promises as fs } from "fs";
import spawn from "cross-spawn";

const GIT_WORKTREE_TIMEOUT_MS = 5_000;

export interface RegisteredWorktreeResult {
  paths: string[];
  warning?: string;
}

function runWorktreeList(projectPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", ["-C", projectPath, "worktree", "list", "--porcelain"], {
      stdio: ["ignore", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      settle(() => {
        child.kill();
        reject(new Error("git worktree list timed out"));
      });
    }, GIT_WORKTREE_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) =>
      settle(() => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(stderr.trim() || stdout.trim() || "git worktree list failed"));
      })
    );
  });
}

/**
 * 只返回 Git 当前仍注册且能 canonicalize 的 worktree。
 * 命令或 realpath 失败时安全降级为空列表，由调用方单独保留项目根为可信目录。
 */
export async function listRegisteredWorktreePaths(
  projectPath: string
): Promise<RegisteredWorktreeResult> {
  try {
    const output = await runWorktreeList(projectPath);
    const rawPaths = output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim())
      .filter(Boolean);
    const canonicalPaths = await Promise.all(
      rawPaths.map(async (worktreePath) => {
        try {
          return await fs.realpath(worktreePath);
        } catch {
          return null;
        }
      })
    );

    return { paths: [...new Set(canonicalPaths.filter((path): path is string => Boolean(path)))] };
  } catch (error: unknown) {
    return {
      paths: [],
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}
