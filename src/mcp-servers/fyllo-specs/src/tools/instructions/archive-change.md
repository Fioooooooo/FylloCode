Archive a completed change using the provided `state`.

**Steps**

1. **Check artifact completion**

   Read `state.archive` to see the OpenSpec archive status and target path.

   **If expected artifacts (proposal, design, specs, tasks) are missing or not `done`:**
   - Display warning listing the gap
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

2. **Check task completion**

   Read `state.archive.incompleteTasks` (count of `- [ ]` items in tasks.md).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

3. **Understand automatic delta spec sync**

   The OpenSpec archive runtime decides whether delta specs need to be synced and performs that sync
   automatically as part of confirmed archive execution. Do not ask the user to choose between
   syncing and archiving without syncing, and do not offer an archive-without-syncing path.

   If delta specs exist, show their preview summary for awareness only. After confirmation, use
   `state.archive.archiveRawOutput` as the source of truth for what OpenSpec actually synced.

4. **Confirm archive**

   If `state.archive.conflicts` is non-empty, the archive target already exists — fail with an error
   and suggest renaming the existing archive or using a different date.

   Otherwise, call this tool again with `confirm: true` and a valid `commitMessage` to perform the
   archive move and workspace git finalization.

   Workspace finalization is also handled by this tool. In linked worktree mode, the normal sequence
   is `commit`, `merge-to-main`, `worktree-remove`, `branch-delete`. If the first fast-forward merge
   fails because main has local commits and both workspaces are clean, the tool automatically runs
   `rebase-onto-main`, retries the fast-forward merge as `merge-to-main-retry`, then continues
   cleanup.

5. **Check generated spec Purpose**

   After `confirm: true` returns, inspect any main specs created by this archive run before showing
   the final archive summary. Limit this check to specs whose `## Purpose` still contains the
   OpenSpec skeleton text for the current change:
   `TBD - created by archiving change <change-name>. Update Purpose after archive.`

   For each matching `openspec/specs/<capability>/spec.md`, replace the skeleton Purpose with a
   concise description of the capability's responsibility, behavior boundary, and primary contract
   source. Derive the wording from the proposal, delta spec requirements, or the synced main spec
   requirements.

   Do not delete the `## Purpose` section. The final Purpose content must be non-empty, specific to
   the current spec, substantive rather than a generic placeholder or template sentence, and at least
   50 characters long.

   The replacement Purpose must not contain `TBD`, `created by archiving change`, the change name, or
   archive/sync process details. Do not rewrite unrelated historical specs or existing hand-written
   Purpose sections.

   If any main spec created by this archive still contains the skeleton Purpose, do not claim the
   archive is complete. Report the remaining file path(s) and the required Purpose update instead.

   The confirmed archive tool has already created the archive commit before this Purpose check. If
   any Purpose replacement changes files, fold those changes into that same archive commit; never
   leave a separate follow-up commit for the Purpose repair:

   - Immediately after successful finalization and before editing, capture the finalized repository's
     current `HEAD` as the archive commit. In linked-worktree mode, use the finalized main repository,
     not the removed linked worktree.
   - After editing, stage only the Purpose files changed by this checkpoint, verify that `HEAD` still
     points to the captured archive commit, then amend it without changing its message (for example,
     `git commit --amend --no-edit`).
   - If the archive commit is no longer `HEAD`, use a targeted fixup/autosquash or equivalent rebase
     only when you can prove the intervening commits will be preserved unchanged. Otherwise stop and
     report the blocker instead of rewriting unrelated history.
   - Verify the final history contains one archive delivery commit and no standalone Purpose-repair
     commit before reporting completion.

6. **Display summary**

   If `state.archive.archiveRawOutput` is non-null, read it and use it as the primary source for what
   the archive command actually did.

   Read `state.target` for the ProposalRef and trusted worktree target. Read `state.finalization` for git finalization:
   - If `state.finalization.ok === true`, summarize the completed `state.finalization.gitOps`.
   - If `state.finalization.ok === false`, report that the failure happened in worktree finalization,
     list completed `state.finalization.gitOps`, identify `state.finalization.failedStep`, and relay
     `state.finalization.error.retryHint` when present.
   - If `state.archive.ok === true`, `state.finalization.ok === false`, and
     `state.finalization.recovery.required === "agent"`, do not rerun OpenSpec archive and do not move
     archive files manually. Report the recovery kind, completed steps, remaining steps, and
     instructions from `state.finalization.recovery`; the agent may continue only the bounded
     metadata repair and git finalization work described there.

   Resolve the archive that actually exists after finalization and link to its concrete `proposal.md`
   file so FylloCode can preview it. Do not link to an archive directory. For a successfully finalized
   linked working copy, use the corresponding archive under the main repository from
   `state.finalization.recovery.mainPath`; do not use the stale `state.archive.archiveTarget` inside a
   linked working copy that has been removed. If finalization is incomplete, link to the archived
   `proposal.md` file that currently exists. Verify the file exists before including it.

   If specs were synced, include clickable links to the concrete final `spec.md` files that were
   updated or created. Use the paths verified after finalization; never link to a directory or to a
   spec file inside a removed linked working copy.

   Keep the section titles and compact field labels shown in the examples below in English. Explain
   details and recovery actions in the user's language. Translate internal Git steps into user-facing
   operations such as "creating the commit", "updating the main working copy", and "removing the
   temporary working copy". Do not expose internal names such as `ProposalRef`, `worktreeMode`,
   `gitOps`, `recovery.kind`, or raw Folder IDs in the user-facing summary.

   Show archive completion summary including:
   - Change name
   - A clickable link to the final archived `proposal.md` file that currently exists
   - Whether specs were synced
   - Clickable links to final synced `spec.md` files when applicable
   - Purpose placeholder check result for any main specs created by this archive
   - Whether any Purpose repair was folded into the archive commit, and the single-commit check result
   - Any important messages, warnings, or sync details surfaced in `state.archive.archiveRawOutput`
   - A user-facing summary of repository update and temporary-working-copy cleanup
   - The failed operation and remaining recovery actions in user-facing language when recovery is required
   - Commit message used
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Archived proposal:** [View proposal](<final-archive-proposal-file-path>)
**Specification updates:** Synced automatically / No updates needed
**Updated specifications:**
- [View specification](<final-spec-file-path>)
**Specification descriptions:** No placeholders / Updated and included in the archive commit
**Commit:** <commit message>
**Repository update:** Complete
**Temporary working copy:** Removed / Not used

All artifacts complete. All tasks complete.
```

**Output On Partial Completion**

```
## Archive Partially Complete

**Change:** <change-name>
**Archived proposal:** [View proposal](<existing-archive-proposal-file-path>)
**Repository update:** Needs attention
**Stopped while:** <user-readable operation>
**What remains:** <user-readable recovery steps>
```

**Guardrails**

- Do not invoke the OpenSpec CLI or shell archive commands directly. Archive operations are handled by this MCP server via `confirm: true`.
- Git commit / merge / worktree-cleanup are handled by this tool and returned in `state.finalization`.
- Do not manually run git cleanup commands before calling this tool. After this tool returns
  `state.archive.ok === true`, `state.finalization.ok === false`, and
  `state.finalization.recovery.required === "agent"`, continue only from the returned recovery state.
- If `state.archive.ok === false`, do not run git finalization commands and do not move archive files
  manually.
- The commit subject must describe the proposal's delivered change (for example, `feat(scope): summary`).
  Archive/sync facts (synced specs, archived artifacts, etc.) may appear as optional body bullets or in
  the final archive summary, but they must not dominate the subject. Vague `archive <changeName>`
  subjects are not allowed.
- Don't block archive on warnings — just inform and confirm
- If `state.archive.conflicts` is non-empty, do NOT proceed with `confirm: true` — report the conflict instead
- If `state.archive.archiveRawOutput` is available, prefer it over inference when describing the actual archive result
- Never leave a separate commit for generated Purpose repair; fold it into the archive commit and verify the final single-commit result
- Keep output headings in English, use user-facing terms instead of internal state names, and link only to previewable files that exist after the reported operations
- Show a clear summary of what happened
