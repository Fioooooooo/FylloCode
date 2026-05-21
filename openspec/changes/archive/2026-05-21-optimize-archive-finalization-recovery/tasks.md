## 1. Runtime Workspace Types and Git Primitives

- [x] 1.1 Update `mcp-servers/fyllo-specs/src/runtime-workspace/types.ts` so `ArchiveGitStep` includes `rebase-onto-main` and `merge-to-main-retry`, `ArchiveGitOpResult` includes optional `outcome: "created" | "noop" | "failed"`, and `FinalizeArchiveWorkspaceResult` includes optional `recovery`.
- [x] 1.2 Add an `ArchiveWorkspaceRecovery` type in `mcp-servers/fyllo-specs/src/runtime-workspace/types.ts` with `required`, `kind`, `mainPath`, `workspacePath`, `mainBranch`, `proposalBranch`, `completedSteps`, `remainingSteps`, and `instructions`.
- [x] 1.3 Extend `mcp-servers/fyllo-specs/src/runtime-workspace/git.ts` with reusable helpers to read `git status --porcelain`, current branch name, branch existence, and rebase-in-progress state without throwing on non-zero exit.
- [x] 1.4 Update `runGitCompositeStep()` or add a commit-specific helper so `git add -A` followed by no diff records a successful `commit` op with `outcome: "noop"` instead of running a failing `git commit`.

## 2. Archive Finalization Recovery

- [x] 2.1 Modify `mcp-servers/fyllo-specs/src/runtime-workspace/finalize-archive-workspace.ts` so linked finalization first attempts the existing `commit`, `merge-to-main`, `worktree-remove`, `branch-delete` sequence.
- [x] 2.2 In `finalizeArchiveWorkspace()`, classify a failed `merge-to-main` as recoverable only when it is a non-fast-forward failure, main workspace is clean, linked worktree is clean, proposal branch exists, and linked worktree is not already in a rebase.
- [x] 2.3 When classification is recoverable, run `git -C <workspacePath> rebase <mainBranch>` as `rebase-onto-main`, then retry `git -C <mainPath> merge --ff-only proposal/<changeName>` as `merge-to-main-retry`.
- [x] 2.4 Continue `worktree-remove` and `branch-delete` after successful `merge-to-main-retry`, preserving ordered `gitOps` with the original failed `merge-to-main` included.
- [x] 2.5 Return `workspace.recovery.required === "agent"` with `kind: "rebase-conflict"` when `rebase-onto-main` fails due to conflict, and do not run retry merge or cleanup.
- [x] 2.6 Return `workspace.recovery.required === "agent"` with `kind: "dirty-workspace"` when main or linked worktree is dirty after the commit step, and do not run rebase.
- [x] 2.7 Return `workspace.recovery.required === "agent"` with `kind: "missing-branch"` or `kind: "unknown-git-error"` for unsafe branch or unclassified git states, and include concrete remaining steps.

## 3. Tool State and Instructions

- [x] 3.1 Update `mcp-servers/fyllo-specs/src/tools/archive-change.ts` type assumptions so returned `workspace.gitOps`, `failedStep`, and `recovery` match the expanded runtime result.
- [x] 3.2 Update `mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md` so commit messages must be based on changed files, synced specs, archived artifacts, and `archiveRawOutput`; explicitly disallow vague `archive <changeName>` summaries.
- [x] 3.3 Update `mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md` to explain automatic rebase recovery and how to report `workspace.recovery.required === "agent"` without rerunning OpenSpec archive.
- [x] 3.4 Ensure `archive-change` preview behavior remains unchanged: no `commitMessage` required, no git ops, no disk movement.

## 4. Archive System Reminder

- [x] 4.1 Modify `electron/main/services/chat/system-reminder/templates/archive.txt` so it still requires `mcp__fyllo_specs__archive-change` as the primary archive path.
- [x] 4.2 Replace the current blanket prohibition on manual git recovery with a bounded rule: when `state.archive.ok === true`, `state.workspace.ok === false`, and `state.workspace.recovery.required === "agent"`, the agent may continue workspace finalization from the returned recovery state.
- [x] 4.3 Keep the hard prohibition on bypassing OpenSpec archive: when `state.archive.ok === false`, the agent must not move archive files manually or run git finalization commands.
- [x] 4.4 Update the reminder reporting requirements so the agent reports archive success, failed workspace step, completed gitOps, recovery kind, remaining steps, finalization status, and commit message used.

## 5. Tests

- [x] 5.1 Add or update `mcp-servers/fyllo-specs/__tests__/runtime.test.ts` for main-mode no-diff commit no-op success.
- [x] 5.2 Add linked-worktree runtime test where main has a local commit, initial `merge-to-main` fails, `rebase-onto-main` succeeds, retry merge succeeds, and cleanup completes.
- [x] 5.3 Add linked-worktree runtime test where automatic rebase conflicts and result contains `recovery.required === "agent"` with `failedStep === "rebase-onto-main"`.
- [x] 5.4 Add linked-worktree runtime test where dirty main or linked worktree prevents automatic rebase and result contains `recovery.kind === "dirty-workspace"`.
- [x] 5.5 Update `mcp-servers/fyllo-specs/__tests__/tools.test.ts` assertions for expanded `gitOps` steps and recovery state.
- [x] 5.6 Update `electron/main/__tests__/services/chat/system-reminder/archive.spec.ts` so archive reminder allows bounded agent recovery after tool finalization failure while still forbidding bypass when archive fails.

## 6. Validation

- [x] 6.1 Run `pnpm exec openspec validate optimize-archive-finalization-recovery --strict` from the proposal workspace or main repo.
- [x] 6.2 Run focused tests for `mcp-servers/fyllo-specs/__tests__/runtime.test.ts`, `mcp-servers/fyllo-specs/__tests__/tools.test.ts`, and `electron/main/__tests__/services/chat/system-reminder/archive.spec.ts`.
- [x] 6.3 Run `pnpm test` if focused tests pass and time permits.
