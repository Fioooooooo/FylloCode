import { existsSync } from "fs";
import path from "path";
import spawn from "cross-spawn";
import type { ArchiveGitOpResult, ArchiveGitStep } from "./types";

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

export async function runGitStep(input: {
  step: ArchiveGitStep;
  cwd: string;
  args: string[];
}): Promise<ArchiveGitOpResult> {
  const result = await runGit(input.cwd, input.args);
  return {
    step: input.step,
    cwd: input.cwd,
    command: formatCommand("git", input.args),
    ...result,
    ok: result.exitCode === 0,
  };
}

export async function runGitCompositeStep(input: {
  step: ArchiveGitStep;
  cwd: string;
  commands: string[][];
}): Promise<ArchiveGitOpResult> {
  let stdout = "";
  let stderr = "";

  for (const args of input.commands) {
    const result = await runGit(input.cwd, args);
    stdout += result.stdout;
    stderr += result.stderr;
    if (result.exitCode !== 0) {
      return {
        step: input.step,
        cwd: input.cwd,
        command: input.commands.map((command) => formatCommand("git", command)).join(" && "),
        exitCode: result.exitCode,
        stdout,
        stderr,
        ok: false,
      };
    }
  }

  return {
    step: input.step,
    cwd: input.cwd,
    command: input.commands.map((command) => formatCommand("git", command)).join(" && "),
    exitCode: 0,
    stdout,
    stderr,
    ok: true,
  };
}

export async function runGitCommitStep(input: {
  cwd: string;
  commitMessage: string;
}): Promise<ArchiveGitOpResult> {
  let stdout = "";
  let stderr = "";

  const addArgs = ["add", "-A"];
  const statusArgs = ["status", "--porcelain"];
  const commitArgs = ["commit", "-m", input.commitMessage];
  const addResult = await runGit(input.cwd, addArgs);
  stdout += addResult.stdout;
  stderr += addResult.stderr;

  if (addResult.exitCode !== 0) {
    return {
      step: "commit",
      cwd: input.cwd,
      command: formatCommand("git", addArgs),
      exitCode: addResult.exitCode,
      stdout,
      stderr,
      ok: false,
      outcome: "failed",
    };
  }

  const statusResult = await runGit(input.cwd, statusArgs);
  stdout += statusResult.stdout;
  stderr += statusResult.stderr;
  const statusCommand = [addArgs, statusArgs].map((command) => formatCommand("git", command));

  if (statusResult.exitCode !== 0) {
    return {
      step: "commit",
      cwd: input.cwd,
      command: statusCommand.join(" && "),
      exitCode: statusResult.exitCode,
      stdout,
      stderr,
      ok: false,
      outcome: "failed",
    };
  }

  if (statusResult.stdout.trim() === "") {
    return {
      step: "commit",
      cwd: input.cwd,
      command: statusCommand.join(" && "),
      exitCode: 0,
      stdout,
      stderr,
      ok: true,
      outcome: "noop",
    };
  }

  const commitResult = await runGit(input.cwd, commitArgs);
  stdout += commitResult.stdout;
  stderr += commitResult.stderr;
  return {
    step: "commit",
    cwd: input.cwd,
    command: [...statusCommand, formatCommand("git", commitArgs)].join(" && "),
    exitCode: commitResult.exitCode,
    stdout,
    stderr,
    ok: commitResult.exitCode === 0,
    outcome: commitResult.exitCode === 0 ? "created" : "failed",
  };
}

export async function runGit(
  cwd: string,
  args: string[]
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
        LANGUAGE: "C",
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({
        exitCode: null,
        stdout,
        stderr: stderr || error.message,
      });
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

export async function readGitStatusPorcelain(cwd: string): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  clean: boolean;
}> {
  const result = await runGit(cwd, ["status", "--porcelain"]);
  return {
    ...result,
    clean: result.exitCode === 0 && result.stdout.trim() === "",
  };
}

export async function readCurrentBranchName(cwd: string): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  branch: string | null;
}> {
  const result = await runGit(cwd, ["branch", "--show-current"]);
  const branch = result.exitCode === 0 ? result.stdout.trim() || null : null;
  return {
    ...result,
    branch,
  };
}

export async function readBranchExists(
  cwd: string,
  branchName: string
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  exists: boolean;
}> {
  const result = await runGit(cwd, ["rev-parse", "--verify", "--quiet", branchName]);
  return {
    ...result,
    exists: result.exitCode === 0,
  };
}

export async function readRebaseInProgress(cwd: string): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  inProgress: boolean;
}> {
  const gitDirResult = await runGit(cwd, ["rev-parse", "--git-dir"]);
  if (gitDirResult.exitCode !== 0) {
    return {
      ...gitDirResult,
      inProgress: false,
    };
  }

  const gitDir = gitDirResult.stdout.trim();
  const resolvedGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(cwd, gitDir);
  return {
    ...gitDirResult,
    inProgress:
      existsSync(path.join(resolvedGitDir, "rebase-merge")) ||
      existsSync(path.join(resolvedGitDir, "rebase-apply")),
  };
}
