Implement tasks from an OpenSpec change using the provided `state`.

**Steps**

1. **Check state**

   Read `state` to understand the current situation:
   - `state.changeName`: The change being implemented
   - `state.target`: the trusted `{ proposalRef, worktreeMode, worktreePath }`; use its worktreePath as the artifact root and its ProposalRef for later calls
   - `state.schemaName`: The workflow being used (e.g., "spec-driven")
   - `state.applyState`: `"ready"` | `"blocked"` | `"all_done"`
   - `state.tasks`: Task list with line numbers, text, and done status
   - `state.progress`: `{ total, complete, remaining }`
   - `state.contextFiles`: artifact ID → array of file paths to read

   **Handle states:**
   - If `applyState: "blocked"` (missing artifacts): inform the user, suggest creating missing artifacts first
   - If `applyState: "all_done"`: congratulate, suggest archiving
   - Otherwise: proceed to implementation

2. **Read context files**

   Read every file path listed under `state.contextFiles` before changing any code.
   For spec-driven schema these are typically: proposal, specs, design, tasks.

3. **Show current progress**

   Display(with user language):
   - Change name
   - A clickable Markdown link to the change's `tasks.md` from `state.contextFiles`
   - Progress: "N/M tasks complete"
   - Remaining tasks overview

   Keep the section titles and compact field labels shown in the examples below in English. Explain
   task details, issues, checks, and next actions in the user's language. Use user-facing terms such as
   "Tasks" and "task checklist"; do not expose internal names such as `ProposalRef`, `worktreeMode`,
   `state.target`, or raw Folder IDs. Link to the concrete `tasks.md` file that FylloCode can preview;
   do not link to a directory. Use an absolute Markdown link target, not inline code or plain unlinked
   text.

4. **Implement tasks (loop until done or blocked)**

   For each pending task in `state.tasks` (where `done: false`):
   - Show which task is being worked on
   - Make the code changes required
   - Keep changes minimal and focused
   - As soon as that task is complete, immediately mark it complete in the tasks file:
     `- [ ]` → `- [x]`
   - Do not start another pending task until the completed task's checkbox has been updated
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → suggest updating artifacts
   - Error or blocker encountered → report and wait for guidance
   - User interrupts

5. **On completion or pause, show status**

   Display(with user language):
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest archiving
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name>

**Tasks:** [View task checklist](<absolute-tasks-file-path>)
**Progress:** 2/7 tasks complete

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete; checklist updated

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete; checklist updated
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Tasks:** [View task checklist](<absolute-tasks-file-path>)
**Progress:** 7/7 tasks complete ✓
**Checks:** <verification summary>
**Next step:** Ready to archive

### Completed This Session
- [x] Task 1
- [x] Task 2
...

All tasks complete! Ready to archive this change.
```

**Output On Pause (Issue Encountered)**

```
## Implementation Paused

**Change:** <change-name>
**Tasks:** [View task checklist](<absolute-tasks-file-path>)
**Progress:** 4/7 tasks complete
**Blocked task:** <task description>

### Issue Encountered
<description of the issue>

**What is needed:** <next action or decision>
```

**Guardrails**

- Do not invoke the OpenSpec CLI directly. All status and apply instructions are provided through `state`.
- Do not accept or reconstruct a target path from the caller; the tool has already resolved `state.target` from ProposalRef.
- Always read `state.contextFiles` before starting implementation
- Keep going through tasks until done or blocked
- If a task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update each task checkbox immediately after completing that task and before starting the next one
- Never defer checkbox updates or batch-mark multiple tasks after the implementation work is finished
- Keep output headings in English, use user-facing labels, and link to the previewable `tasks.md` file instead of a working-copy directory
- Pause on errors, blockers, or unclear requirements — don't guess
