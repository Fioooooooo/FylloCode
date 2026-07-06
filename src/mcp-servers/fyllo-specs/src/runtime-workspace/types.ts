export type WorkspaceMode = "linked" | "main";

export interface WorkspaceInfo {
  mode: WorkspaceMode;
  path: string;
}

export interface ReadableWorkspaceInfo {
  mode: WorkspaceMode;
  path: string;
}

export interface ReadableWorkspacesResult {
  workspaces: ReadableWorkspaceInfo[];
  warnings: string[];
}

export type ArchiveGitStep =
  | "commit"
  | "merge-to-main"
  | "rebase-onto-main"
  | "merge-to-main-retry"
  | "worktree-remove"
  | "branch-delete";

export interface ArchiveGitOpResult {
  step: ArchiveGitStep;
  cwd: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  ok: boolean;
  outcome?: "created" | "noop" | "failed";
}

export interface WorkspaceRuntimeError {
  code: string;
  message: string;
  retryHint: string;
}

export interface PrepareProposalWorkspaceResult {
  workspace: WorkspaceInfo;
  warnings: string[];
}

export interface ArchiveWorkspaceRecovery {
  required: "none" | "agent";
  kind: "none" | "rebase-conflict" | "dirty-workspace" | "missing-branch" | "unknown-git-error";
  mainPath: string;
  workspacePath: string;
  mainBranch: string | null;
  proposalBranch: string;
  completedSteps: string[];
  remainingSteps: string[];
  instructions: string[];
}

export interface FinalizeArchiveWorkspaceResult extends WorkspaceInfo {
  ok: boolean;
  gitOps: ArchiveGitOpResult[];
  failedStep: ArchiveGitStep | null;
  recovery?: ArchiveWorkspaceRecovery;
  error?: WorkspaceRuntimeError;
}
