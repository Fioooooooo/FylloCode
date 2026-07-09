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

3. **Assess delta spec sync state**

   The OpenSpec archive runtime handles spec sync. Use `state.archive.archiveRawOutput` after
   confirmation as the source for what was synced.

   **If delta specs exist:**
   - Show the summary of what would be synced
   - Offer options: "Sync now (recommended)" or "Archive without syncing"
   - If user chooses sync, handle spec sync before archiving

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

6. **Display summary**

   If `state.archive.archiveRawOutput` is non-null, read it and use it as the primary source for what
   the archive command actually did.

   Read `state.workspace` for git finalization:
   - If `state.workspace.ok === true`, summarize the completed `state.workspace.gitOps`.
   - If `state.workspace.ok === false`, report that the failure happened in workspace finalization,
     list completed `state.workspace.gitOps`, identify `state.workspace.failedStep`, and relay
     `state.workspace.error.retryHint` when present.
   - If `state.archive.ok === true`, `state.workspace.ok === false`, and
     `state.workspace.recovery.required === "agent"`, do not rerun OpenSpec archive and do not move
     archive files manually. Report the recovery kind, completed steps, remaining steps, and
     instructions from `state.workspace.recovery`; the agent may continue only the bounded git
     finalization work described there.

   Show archive completion summary(with user language) including:
   - Change name
   - Archive location (`state.archive.archiveTarget`)
   - Whether specs were synced
   - Purpose placeholder check result for any main specs created by this archive
   - Any important messages, warnings, or sync details surfaced in `state.archive.archiveRawOutput`
   - Workspace mode/path and git finalization status
   - Failed workspace step, recovery kind, and remaining recovery steps when recovery is required
   - Commit message used
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All artifacts complete. All tasks complete.
```

**Guardrails**

- Do not invoke the OpenSpec CLI or shell archive commands directly. Archive operations are handled by this MCP server via `confirm: true`.
- Git commit / merge / worktree-cleanup are handled by this tool and returned in `state.workspace`.
- Do not manually run git cleanup commands before calling this tool. After this tool returns
  `state.archive.ok === true`, `state.workspace.ok === false`, and
  `state.workspace.recovery.required === "agent"`, continue only from the returned recovery state.
- If `state.archive.ok === false`, do not run git finalization commands and do not move archive files
  manually.
- The commit subject must describe the proposal's delivered change (for example, `feat(scope): summary`).
  Archive/sync facts (synced specs, archived artifacts, etc.) may appear as optional body bullets or in
  the final archive summary, but they must not dominate the subject. Vague `archive <changeName>`
  subjects are not allowed.
- Don't block archive on warnings — just inform and confirm
- If `state.archive.conflicts` is non-empty, do NOT proceed with `confirm: true` — report the conflict instead
- If `state.archive.archiveRawOutput` is available, prefer it over inference when describing the actual archive result
- Show a clear summary of what happened
