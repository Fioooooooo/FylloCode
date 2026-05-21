## Why

`archive-change` can currently complete OpenSpec archive and the proposal-branch commit, then fail the overall archive run when `git merge --ff-only` cannot advance main because main has local commits. This leaves the archive state, worktree state, and branch cleanup in a partially finalized state that the Archive stage prompt currently prevents the agent from recovering unless the user explicitly intervenes.

This change makes archive finalization recoverable: the MCP tool should automatically handle the safe "rehash by rebase" case, and the agent should only take over when the tool reaches an engineering boundary such as a rebase conflict or dirty workspace.

## What Changes

- Update linked-worktree archive finalization so `archive-change` automatically classifies `merge-to-main` fast-forward failures.
- When the failure is a clean, ordinary divergence where main has local commits and the proposal branch can be replayed, `archive-change` SHALL rebase the proposal worktree onto the current main branch, retry the fast-forward merge, then continue worktree removal and branch deletion.
- When automatic recovery is unsafe or fails, `archive-change` SHALL return structured recovery context that preserves `archive.ok === true`, identifies the failed workspace step, and tells the agent what remains.
- Update Archive stage system-reminder rules so the MCP tool remains the primary path, but the agent may continue workspace finalization after the tool reports a recovery-required state.
- Optimize commit finalization so a commit step with no workspace diff is treated as a successful no-op instead of failing archive finalization.
- Tighten archive commit-message guidance so the agent must summarize the actual changed files, synced specs, and archived artifacts instead of using vague messages such as `archive <changeName>`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `fyllo-specs-mcp`: change `archive-change` workspace finalization semantics, git step state, automatic rebase retry behavior, no-op commit handling, and recovery state returned to agents.
- `proposal-archive-action`: change Archive stage agent rules so MCP-led archive remains required, automatic tool recovery is preferred, and agent takeover is allowed only after tool finalization reaches a structured recovery boundary.

## Impact

- `mcp-servers/fyllo-specs/src/runtime-workspace/*`: git step runner, archive finalization sequence, failure classification, automatic rebase retry, and result types.
- `mcp-servers/fyllo-specs/src/tools/archive-change.ts`: returned `workspace` state, failed-step mapping, and commit-message guidance.
- `mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md`: archive tool instruction for commit-message quality, automatic recovery reporting, and agent takeover conditions.
- `electron/main/services/chat/system-reminder/templates/archive.txt`: Archive stage constraints that currently prohibit manual git recovery after tool failure.
- Tests under `mcp-servers/fyllo-specs/__tests__/` and `electron/main/__tests__/services/chat/system-reminder/`.
