Implement tasks from an OpenSpec change using the provided `state`.

**Input**: `targetPath` is required. It must be an absolute path to the main repo root or a
registered git worktree for that repo. In P1, the agent should default to passing
`$FYLLO_PROJECT_PATH` (the main repo root). `state.changeName` identifies the change being
implemented.

**Steps**

1. **Check state**

   Read `state` to understand the current situation:
   - `state.changeName`: The change being implemented
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

   Display:
   - Schema being used
   - Progress: "N/M tasks complete"
   - Remaining tasks overview

4. **Implement tasks (loop until done or blocked)**

   For each pending task in `state.tasks` (where `done: false`):
   - Show which task is being worked on
   - Make the code changes required
   - Keep changes minimal and focused
   - Mark task complete in the tasks file: `- [ ]` → `- [x]`
   - Continue to next task

   **Pause if:**
   - Task is unclear → ask for clarification
   - Implementation reveals a design issue → suggest updating artifacts
   - Error or blocker encountered → report and wait for guidance
   - User interrupts

5. **On completion or pause, show status**

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest archiving
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name> (schema: <schema-name>)

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 7/7 tasks complete ✓

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
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**Guardrails**

- Do not invoke the OpenSpec CLI directly. All status and apply instructions are provided through `state`.
- Always read `state.contextFiles` before starting implementation
- Keep going through tasks until done or blocked
- If a task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements — don't guess
