import type { ChildProcessWithoutNullStreams } from "child_process";
import { promises as fs } from "fs";
import { basename, join } from "path";
import spawn from "cross-spawn";
import type { GuidelineChange, SpecsGrowthBucket } from "@shared/types/overview";
import { trackAuxiliaryProcess } from "@main/infra/process/auxiliary-process-registry";

export type RepositorySpecsGrowthBucket = Omit<SpecsGrowthBucket, "folderId" | "folderName">;
export type RepositoryGuidelineChange = Omit<GuidelineChange, "folderId" | "folderName">;

export type GitGovernanceStats = {
  specsGrowth: RepositorySpecsGrowthBucket[];
  recentGuidelines: RepositoryGuidelineChange[];
  guidelinesLastUpdated: string | null;
};

const GIT_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: GitGovernanceStats; expireAt: number }>();

type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type GitHistoryAvailability = "available" | "unavailable";

function collectWeekRanges(now = new Date()): { weekStart: Date; weekEnd: Date }[] {
  const currentWeekStart = new Date(now);
  const currentDay = currentWeekStart.getDay();
  const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
  currentWeekStart.setDate(currentWeekStart.getDate() - daysSinceMonday);
  currentWeekStart.setHours(0, 0, 0, 0);

  return Array.from({ length: 8 }, (_, index) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - (7 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
  });
}

export function clearGitStatsCache(): void {
  cache.clear();
}

function runGitCommand(
  projectPath: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS
): Promise<GitCommandResult> {
  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    }) as ChildProcessWithoutNullStreams;
    trackAuxiliaryProcess(child);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill();
        reject(new Error(`git ${args.join(" ")} timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code) => {
      settle(() => {
        resolve({ stdout, stderr, exitCode: code });
      });
    });
  });
}

function gitCommandError(args: string[], result: GitCommandResult): Error {
  return new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
}

export async function runGit(
  projectPath: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS
): Promise<string> {
  const result = await runGitCommand(projectPath, args, timeoutMs);
  if (result.exitCode === 0) {
    return result.stdout;
  }
  throw gitCommandError(args, result);
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function getGitHistoryAvailability(
  projectPath: string
): Promise<GitHistoryAvailability> {
  try {
    await fs.stat(join(projectPath, ".git"));
  } catch (error) {
    if (isMissingPathError(error)) {
      return "unavailable";
    }
    throw error;
  }

  const args = ["rev-parse", "--verify", "--quiet", "HEAD"];
  const result = await runGitCommand(projectPath, args);
  if (result.exitCode === 0) {
    return "available";
  }
  if (result.exitCode === 1) {
    return "unavailable";
  }
  throw gitCommandError(args, result);
}

export async function computeSpecsGrowth(
  projectPath: string
): Promise<RepositorySpecsGrowthBucket[]> {
  const buckets: RepositorySpecsGrowthBucket[] = [];

  for (const { weekStart, weekEnd } of collectWeekRanges()) {
    const sha = (
      await runGit(projectPath, ["rev-list", "-1", `--before=${weekEnd.toISOString()}`, "HEAD"])
    ).trim();
    const output = sha
      ? await runGit(projectPath, ["ls-tree", "-d", "--name-only", sha, "openspec/specs/"])
      : "";

    buckets.push({
      weekStart: weekStart.toISOString(),
      cumulativeCount: output.split(/\r?\n/).filter(Boolean).length,
    });
  }

  return buckets;
}

function truncateMessage(message: string): string {
  return message.length > 80 ? message.slice(0, 80) : message;
}

export async function computeRecentGuidelines(projectPath: string): Promise<{
  recentGuidelines: RepositoryGuidelineChange[];
  guidelinesLastUpdated: string | null;
}> {
  const output = await runGit(projectPath, [
    "log",
    "--format=%aI%x09%s",
    "--name-only",
    "--",
    "guidelines/",
  ]);
  const seen = new Set<string>();
  const recentGuidelines: RepositoryGuidelineChange[] = [];
  let current: { date: string; message: string } | null = null;
  let guidelinesLastUpdated: string | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headerMatch = /^([^\t]+)\t(.*)$/.exec(line);
    if (headerMatch) {
      current = {
        date: headerMatch[1] ?? "",
        message: headerMatch[2] ?? "",
      };
      guidelinesLastUpdated ??= current.date;
      continue;
    }

    if (!current || !line.startsWith("guidelines/") || !line.endsWith(".md")) {
      continue;
    }

    const fileName = basename(line);
    if (seen.has(fileName)) {
      continue;
    }

    seen.add(fileName);
    recentGuidelines.push({
      fileName,
      lastCommitDate: current.date,
      lastCommitMessage: truncateMessage(current.message),
    });
  }

  return {
    recentGuidelines: recentGuidelines
      .sort((left, right) => right.lastCommitDate.localeCompare(left.lastCommitDate))
      .slice(0, 5),
    guidelinesLastUpdated,
  };
}

export async function getGitGovernance(projectPath: string): Promise<GitGovernanceStats> {
  const now = Date.now();
  const cached = cache.get(projectPath);
  if (cached && cached.expireAt > now) {
    return cached.data;
  }

  if ((await getGitHistoryAvailability(projectPath)) === "unavailable") {
    return {
      specsGrowth: [],
      recentGuidelines: [],
      guidelinesLastUpdated: null,
    };
  }

  const [specsGrowth, guidelineStats] = await Promise.all([
    computeSpecsGrowth(projectPath),
    computeRecentGuidelines(projectPath),
  ]);
  const data: GitGovernanceStats = {
    specsGrowth,
    recentGuidelines: guidelineStats.recentGuidelines,
    guidelinesLastUpdated: guidelineStats.guidelinesLastUpdated,
  };
  cache.set(projectPath, { data, expireAt: now + CACHE_TTL_MS });
  return data;
}
