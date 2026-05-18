Archive a completed change using the provided `state`.

**Input**: `state.changeName` identifies the change to archive.

**Steps**

1. **Check artifact completion**

   Read `state.deltaSpecSummary.files` to see which artifact files exist in the change directory.

   **If expected artifacts (proposal, design, specs, tasks) are missing or not `done`:**
   - Display warning listing the gap
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

2. **Check task completion**

   Read `state.incompleteTasks` (count of `- [ ]` items in tasks.md).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Ask the user to confirm they want to proceed
   - Proceed if user confirms

3. **Assess delta spec sync state**

   Read `state.deltaSpecSummary`. If null, no delta specs exist — proceed without sync prompt.

   **If delta specs exist:**
   - Show the summary of what would be synced
   - Offer options: "Sync now (recommended)" or "Archive without syncing"
   - If user chooses sync, handle spec sync before archiving

4. **Confirm archive**

   If `state.conflicts` is non-empty, the archive target already exists — fail with an error and suggest renaming the existing archive or using a different date.

   Otherwise, call this tool again with `confirm: true` to perform the archive move.

5. **Display summary**

   Show archive completion summary including:
   - Change name
   - Archive location (`state.archiveTarget`)
   - Whether specs were synced
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
- Don't block archive on warnings — just inform and confirm
- If `state.conflicts` is non-empty, do NOT proceed with `confirm: true` — report the conflict instead
- Show a clear summary of what happened
