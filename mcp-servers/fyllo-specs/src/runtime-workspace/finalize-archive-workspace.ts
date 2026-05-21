import path from "path";
import type {
  ArchiveGitOpResult,
  ArchiveGitStep,
  ArchiveWorkspaceRecovery,
  FinalizeArchiveWorkspaceResult,
  WorkspaceMode,
  WorkspaceRuntimeError,
} from "./types";
import {
  readBranchExists,
  readCurrentBranchName,
  readGitStatusPorcelain,
  readRebaseInProgress,
  runGitCommitStep,
  runGitStep,
} from "./git";

function createStepError(step: ArchiveGitStep, op: ArchiveGitOpResult): WorkspaceRuntimeError {
  const detail = op.stderr.trim() || op.stdout.trim() || `git exited with code ${op.exitCode}`;
  const hints: Record<ArchiveGitStep, string> = {
    commit:
      "Commit failed. Inspect the workspace status and retry archive-change after resolving the git error.",
    "merge-to-main":
      "Fast-forward merge failed. Resolve main/worktree history divergence, then retry archive-change or complete recovery manually.",
    "rebase-onto-main":
      "Rebase failed. Inspect the proposal worktree rebase state before retrying merge or cleanup.",
    "merge-to-main-retry":
      "Fast-forward merge retry failed. Inspect main and proposal branch history before retrying cleanup.",
    "worktree-remove":
      "Worktree removal failed. Close processes using the worktree or resolve dirty files, then retry cleanup.",
    "branch-delete":
      "Branch deletion failed. Verify the proposal branch is merged before deleting it manually or retrying cleanup.",
  };
  return {
    code: `git-${step}-failed`,
    message: detail,
    retryHint: hints[step],
  };
}

function createRecovery(input: {
  kind: ArchiveWorkspaceRecovery["kind"];
  mainPath: string;
  workspacePath: string;
  mainBranch: string | null;
  proposalBranch: string;
  completedSteps: string[];
  remainingSteps: string[];
  instructions: string[];
}): ArchiveWorkspaceRecovery {
  return {
    required: input.kind === "none" ? "none" : "agent",
    kind: input.kind,
    mainPath: input.mainPath,
    workspacePath: input.workspacePath,
    mainBranch: input.mainBranch,
    proposalBranch: input.proposalBranch,
    completedSteps: input.completedSteps,
    remainingSteps: input.remainingSteps,
    instructions: input.instructions,
  };
}

function completedSteps(gitOps: ArchiveGitOpResult[]): string[] {
  return gitOps.filter((op) => op.ok).map((op) => op.step);
}

function noRecovery(input: {
  mainPath: string;
  workspacePath: string;
  mainBranch: string | null;
  proposalBranch: string;
}): ArchiveWorkspaceRecovery {
  return createRecovery({
    kind: "none",
    mainPath: input.mainPath,
    workspacePath: input.workspacePath,
    mainBranch: input.mainBranch,
    proposalBranch: input.proposalBranch,
    completedSteps: [],
    remainingSteps: [],
    instructions: [],
  });
}

function isNonFastForwardFailure(op: ArchiveGitOpResult): boolean {
  const output = `${op.stdout}\n${op.stderr}`.toLowerCase();
  return (
    output.includes("not possible to fast-forward") ||
    output.includes("non-fast-forward") ||
    output.includes("non fast-forward")
  );
}

function isRebaseConflict(op: ArchiveGitOpResult): boolean {
  const output = `${op.stdout}\n${op.stderr}`.toLowerCase();
  return (
    output.includes("conflict") ||
    output.includes("could not apply") ||
    output.includes("resolve all conflicts")
  );
}

async function runOrStop(
  gitOps: ArchiveGitOpResult[],
  input: { step: ArchiveGitStep; cwd: string; args: string[] }
): Promise<WorkspaceRuntimeError | null> {
  const op = await runGitStep(input);
  gitOps.push(op);
  if (op.ok) {
    return null;
  }
  return createStepError(input.step, op);
}

async function runCommitOrStop(
  gitOps: ArchiveGitOpResult[],
  input: { cwd: string; commitMessage: string }
): Promise<WorkspaceRuntimeError | null> {
  const op = await runGitCommitStep({
    cwd: input.cwd,
    commitMessage: input.commitMessage,
  });
  gitOps.push(op);
  if (op.ok) {
    return null;
  }
  return createStepError("commit", op);
}

async function runCleanupSteps(input: {
  gitOps: ArchiveGitOpResult[];
  mainPath: string;
  workspacePath: string;
  proposalBranch: string;
}): Promise<{ failedStep: ArchiveGitStep; error: WorkspaceRuntimeError } | null> {
  const steps: Array<{ step: ArchiveGitStep; cwd: string; args: string[] }> = [
    {
      step: "worktree-remove",
      cwd: input.mainPath,
      args: ["worktree", "remove", input.workspacePath],
    },
    {
      step: "branch-delete",
      cwd: input.mainPath,
      args: ["branch", "-d", input.proposalBranch],
    },
  ];

  for (const step of steps) {
    const error = await runOrStop(input.gitOps, step);
    if (error) {
      return {
        failedStep: step.step,
        error,
      };
    }
  }

  return null;
}

export async function finalizeArchiveWorkspace(input: {
  mainProjectPath: string;
  workspacePath: string;
  changeName: string;
  commitMessage: string;
}): Promise<FinalizeArchiveWorkspaceResult> {
  const mainPath = path.resolve(input.mainProjectPath);
  const workspacePath = path.resolve(input.workspacePath);
  const mode: WorkspaceMode = workspacePath === mainPath ? "main" : "linked";
  const gitOps: ArchiveGitOpResult[] = [];
  const proposalBranch = `proposal/${input.changeName}`;
  const mainBranchResult = await readCurrentBranchName(mainPath);
  const mainBranch = mainBranchResult.branch;

  const commitError = await runCommitOrStop(gitOps, {
    cwd: workspacePath,
    commitMessage: input.commitMessage,
  });
  if (commitError) {
    return {
      mode,
      path: workspacePath,
      ok: false,
      gitOps,
      failedStep: "commit",
      error: commitError,
      recovery: createRecovery({
        kind: "unknown-git-error",
        mainPath,
        workspacePath,
        mainBranch,
        proposalBranch,
        completedSteps: completedSteps(gitOps),
        remainingSteps: ["commit"],
        instructions: [
          "Resolve the commit failure, then rerun archive-change or continue manually.",
        ],
      }),
    };
  }

  if (mode === "main") {
    return {
      mode,
      path: workspacePath,
      ok: true,
      gitOps,
      failedStep: null,
      recovery: noRecovery({ mainPath, workspacePath, mainBranch, proposalBranch }),
    };
  }

  const mergeError = await runOrStop(gitOps, {
    step: "merge-to-main",
    cwd: mainPath,
    args: ["merge", "--ff-only", proposalBranch],
  });
  if (mergeError) {
    const mergeOp = gitOps.at(-1)!;
    const mainStatus = await readGitStatusPorcelain(mainPath);
    const workspaceStatus = await readGitStatusPorcelain(workspacePath);
    const branchStatus = await readBranchExists(mainPath, proposalBranch);
    const rebaseStatus = await readRebaseInProgress(workspacePath);

    if (!mainStatus.clean || !workspaceStatus.clean) {
      return {
        mode,
        path: workspacePath,
        ok: false,
        gitOps,
        failedStep: "merge-to-main",
        error: {
          ...mergeError,
          retryHint:
            "Protect and clean the dirty main workspace or proposal worktree before continuing finalization.",
        },
        recovery: createRecovery({
          kind: "dirty-workspace",
          mainPath,
          workspacePath,
          mainBranch,
          proposalBranch,
          completedSteps: completedSteps(gitOps),
          remainingSteps: [
            "protect-and-clean-workspaces",
            "rebase-onto-main",
            "merge-to-main-retry",
            "worktree-remove",
            "branch-delete",
          ],
          instructions: [
            "OpenSpec archive already succeeded; do not rerun archive-change for archive files.",
            "Protect any uncommitted user work in the dirty workspace before running rebase or cleanup.",
            "After both workspaces are clean, rebase the proposal branch onto main, retry ff-only merge, remove the worktree, and delete the proposal branch.",
          ],
        }),
      };
    }

    if (!branchStatus.exists) {
      return {
        mode,
        path: workspacePath,
        ok: false,
        gitOps,
        failedStep: "merge-to-main",
        error: {
          code: "git-missing-branch",
          message: `Proposal branch not found: ${proposalBranch}`,
          retryHint: "Verify the proposal branch before continuing workspace finalization.",
        },
        recovery: createRecovery({
          kind: "missing-branch",
          mainPath,
          workspacePath,
          mainBranch,
          proposalBranch,
          completedSteps: completedSteps(gitOps),
          remainingSteps: ["restore-or-identify-proposal-branch", "merge-to-main-retry", "cleanup"],
          instructions: [
            "OpenSpec archive already succeeded; do not move archive files manually.",
            "Find or restore the proposal branch before retrying merge and cleanup.",
          ],
        }),
      };
    }

    if (!mainBranch || !isNonFastForwardFailure(mergeOp) || rebaseStatus.inProgress) {
      return {
        mode,
        path: workspacePath,
        ok: false,
        gitOps,
        failedStep: "merge-to-main",
        error: mergeError,
        recovery: createRecovery({
          kind: "unknown-git-error",
          mainPath,
          workspacePath,
          mainBranch,
          proposalBranch,
          completedSteps: completedSteps(gitOps),
          remainingSteps: [
            "inspect-git-state",
            "merge-to-main-retry",
            "worktree-remove",
            "branch-delete",
          ],
          instructions: [
            "OpenSpec archive already succeeded; do not rerun archive-change for archive files.",
            "Inspect the merge failure, current main branch, and proposal worktree rebase state before continuing finalization.",
          ],
        }),
      };
    }

    const rebaseError = await runOrStop(gitOps, {
      step: "rebase-onto-main",
      cwd: workspacePath,
      args: ["rebase", mainBranch],
    });
    if (rebaseError) {
      const rebaseOp = gitOps.at(-1)!;
      const rebaseInProgress = await readRebaseInProgress(workspacePath);
      const kind =
        isRebaseConflict(rebaseOp) || rebaseInProgress.inProgress
          ? "rebase-conflict"
          : "unknown-git-error";
      return {
        mode,
        path: workspacePath,
        ok: false,
        gitOps,
        failedStep: "rebase-onto-main",
        error: rebaseError,
        recovery: createRecovery({
          kind,
          mainPath,
          workspacePath,
          mainBranch,
          proposalBranch,
          completedSteps: completedSteps(gitOps),
          remainingSteps: [
            "resolve-or-abort-rebase",
            "merge-to-main-retry",
            "worktree-remove",
            "branch-delete",
          ],
          instructions: [
            "OpenSpec archive already succeeded; do not rerun archive-change for archive files.",
            "Resolve the rebase state in the proposal worktree, then continue rebase.",
            "After rebase completes, retry fast-forward merge in main, remove the worktree, and delete the proposal branch.",
          ],
        }),
      };
    }

    const mergeRetryError = await runOrStop(gitOps, {
      step: "merge-to-main-retry",
      cwd: mainPath,
      args: ["merge", "--ff-only", proposalBranch],
    });
    if (mergeRetryError) {
      return {
        mode,
        path: workspacePath,
        ok: false,
        gitOps,
        failedStep: "merge-to-main-retry",
        error: mergeRetryError,
        recovery: createRecovery({
          kind: "unknown-git-error",
          mainPath,
          workspacePath,
          mainBranch,
          proposalBranch,
          completedSteps: completedSteps(gitOps),
          remainingSteps: ["inspect-git-state", "worktree-remove", "branch-delete"],
          instructions: [
            "OpenSpec archive already succeeded; do not rerun archive-change for archive files.",
            "Inspect why the retry merge failed before running cleanup commands.",
          ],
        }),
      };
    }

    const cleanupError = await runCleanupSteps({
      gitOps,
      mainPath,
      workspacePath,
      proposalBranch,
    });
    if (cleanupError) {
      return {
        mode,
        path: workspacePath,
        ok: false,
        gitOps,
        failedStep: cleanupError.failedStep,
        error: cleanupError.error,
        recovery: createRecovery({
          kind: "unknown-git-error",
          mainPath,
          workspacePath,
          mainBranch,
          proposalBranch,
          completedSteps: completedSteps(gitOps),
          remainingSteps: ["complete-worktree-and-branch-cleanup"],
          instructions: [
            "OpenSpec archive and merge already succeeded; finish only the remaining workspace cleanup.",
          ],
        }),
      };
    }

    return {
      mode,
      path: workspacePath,
      ok: true,
      gitOps,
      failedStep: null,
      recovery: noRecovery({ mainPath, workspacePath, mainBranch, proposalBranch }),
    };
  }

  const cleanupError = await runCleanupSteps({
    gitOps,
    mainPath,
    workspacePath,
    proposalBranch,
  });
  if (cleanupError) {
    return {
      mode,
      path: workspacePath,
      ok: false,
      gitOps,
      failedStep: cleanupError.failedStep,
      error: cleanupError.error,
      recovery: createRecovery({
        kind: "unknown-git-error",
        mainPath,
        workspacePath,
        mainBranch,
        proposalBranch,
        completedSteps: completedSteps(gitOps),
        remainingSteps: ["complete-worktree-and-branch-cleanup"],
        instructions: [
          "OpenSpec archive and merge already succeeded; finish only the remaining workspace cleanup.",
        ],
      }),
    };
  }

  return {
    mode,
    path: workspacePath,
    ok: true,
    gitOps,
    failedStep: null,
    recovery: noRecovery({ mainPath, workspacePath, mainBranch, proposalBranch }),
  };
}
