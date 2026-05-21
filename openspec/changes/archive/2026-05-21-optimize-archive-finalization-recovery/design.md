## Context

`archive-change` currently separates OpenSpec archive state from workspace finalization state. That split is correct, but linked-worktree finalization assumes main can fast-forward directly to `proposal/<changeName>`. The observed failure mode was:

- `archive.ok === true`
- proposal worktree commit succeeded
- `merge-to-main` failed because main already had a local commit and `git merge --ff-only proposal/<changeName>` could not fast-forward
- the proposal branch could be safely rebased onto current main, producing a new commit hash, after which ff-only merge and cleanup succeeded

The current Archive system-reminder also tells the agent not to manually run git commit, merge, worktree cleanup, or branch deletion unless the user explicitly asks for manual recovery. That blocks the desired recovery path when MCP has already done everything it can safely automate.

## Goals / Non-Goals

**Goals:**

- Keep `archive-change` as the primary archive and workspace finalization path.
- Automatically recover the safe linked-worktree fast-forward failure by rebasing the proposal worktree onto current main, retrying ff-only merge, and continuing cleanup.
- Return structured recovery context when automatic recovery is unsafe or fails, so the agent can continue from the partially finalized state.
- Treat no-diff commit attempts as successful no-op commit steps.
- Make archive commit messages specific to the files/specs/artifacts changed by the archive.

**Non-Goals:**

- Do not allow agents to bypass a failed OpenSpec archive by moving change files manually.
- Do not replace ff-only finalization with merge commits.
- Do not automatically resolve rebase conflicts.
- Do not add remote push/pull behavior or coordinate with remote branches.

## Decisions

### D1: Add explicit archive git recovery steps

Extend `ArchiveGitStep` with:

- `rebase-onto-main`
- `merge-to-main-retry`

Keep the original first attempt as `merge-to-main` so existing state remains explainable. When recovery runs, `gitOps` records:

1. `commit`
2. `merge-to-main`
3. `rebase-onto-main`
4. `merge-to-main-retry`
5. `worktree-remove`
6. `branch-delete`

Rationale: this preserves the original failure event and makes the recovery path auditable.

### D2: Recover only clean ff-only divergence inside the tool

`finalizeArchiveWorkspace()` should attempt automatic recovery only when all conditions hold:

- mode is `linked`
- failed step is `merge-to-main`
- both main workspace and linked worktree are clean after the commit step
- proposal branch exists
- the first merge failure is a non-fast-forward condition
- no rebase operation is already in progress in the linked worktree

The tool then runs `git -C <worktreePath> rebase <mainBranch>` where `<mainBranch>` is the checked-out branch in `mainProjectPath`, followed by `git -C <mainPath> merge --ff-only proposal/<changeName>`.

Rationale: this directly automates the successful recovery pattern from the incident without introducing merge commits or rewriting unrelated history.

### D3: Agent takeover starts only after structured recovery-required state

If the rebase conflicts, a workspace is dirty, the branch state is unexpected, or an unknown git error occurs, the tool returns `workspace.ok === false` with `workspace.recovery.required === "agent"`.

The recovery payload should include:

- `kind`: e.g. `"rebase-conflict"`, `"dirty-workspace"`, `"unknown-git-error"`
- `mainPath`
- `workspacePath`
- `mainBranch`
- `proposalBranch`
- `completedSteps`
- `remainingSteps`
- `instructions`

Rationale: the agent should not rediscover state from scratch or rerun archive. It should continue workspace finalization from the precise point where the tool stopped.

### D4: No-op commit is success

Before or during the commit composite step, the runtime should detect no staged/unstaged diff after `git add -A`. If there is nothing to commit, the `commit` git op is recorded as `ok: true` with `outcome: "noop"` and no commit command failure.

Rationale: archive finalization should not fail when the desired archive/sync changes were already committed or there is no workspace diff to commit.

### D5: Commit-message quality remains prompt-driven

The tool should continue validating only the `type(scope): summary` subject format. The semantic rule belongs in Archive system-reminder and `archive-change` tool instruction: the agent must inspect changed files, synced specs, archived artifacts, and archive output before choosing the commit message.

Rationale: semantic commit-message quality is difficult to validate reliably in code without false positives; prompt contracts are the right boundary for now.

## Risks / Trade-offs

- Rebase rewrites the proposal branch commit hash. Mitigation: only run it on local linked worktree proposal branches during archive finalization, after confirming clean state; record the rebase step in `gitOps`.
- Rebase conflicts can leave the linked worktree in an in-progress rebase. Mitigation: return structured agent recovery state and do not attempt cleanup.
- Dirty main or linked worktree state could destroy user work if automated blindly. Mitigation: block automatic recovery and require agent takeover with explicit reporting.
- Existing tests may assert the old four-step linked sequence. Mitigation: update tests to cover both direct ff-only and recovered ff-only sequences.

## Migration Plan

No data migration is required. Existing active proposals continue to use the same branch naming and worktree paths. After this change, new archive runs get richer `workspace.gitOps` and optional `workspace.recovery` state.
