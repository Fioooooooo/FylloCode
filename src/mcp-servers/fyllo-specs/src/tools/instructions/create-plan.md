Create a lightweight session-scoped implementation plan.

**Purpose**

Use this tool only after the user asks for a plan, or after you recommend creating a plan and the user explicitly agrees. The Plan path is for complex work that does not change the behavior contract. If investigation shows the work changes requirements, public APIs, schemas, protocols, persistence formats, user-visible behavior, or ownership boundaries, stop and upgrade to a Proposal.

From the moment you decide to create a plan until the user approves it, do not modify business code. Exploration, reading, and analysis are allowed.

Call `create-plan` with only `goal` and the agent-provided `slug` fragment. Do not pass a project path, workspace path, `targetPath`, or `includeInstruction`; the tool creates the plan file in the current Fyllo session and always returns this instruction with state.

**After the tool returns**

1. Read `state.planPath`.
2. Write a complete Markdown plan into that file. Keep the existing YAML frontmatter intact.
3. Derive the full plan slug from the `state.planPath` filename by removing the `.md` extension.
4. After the plan is written, output exactly one `plan.create` Fyllo action so the user can review it in FylloCode.

The `plan.create` payload must contain only:

```json
{
  "slug": "<slug derived from state.planPath filename>",
  "goal": "<the goal value you passed to create-plan>"
}
```

Never include `planPath`, `sessionId`, button labels, handlers, IPC channels, component names, or local filesystem paths in the Fyllo action payload. FylloCode resolves the plan from the current session and slug.

**Plan contents**

Keep these sections meaningful and concise:

- 任务目标/Goal
- 范围边界/Scope
- 关键约束/Constraints
- 方案取舍/Trade-offs
- 实施步骤/Steps
- 验证方式/Verification

After the user approves the plan and sends `我已确认规划方案：<slug>`, reread the latest plan file before implementation.
