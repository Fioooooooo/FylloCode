Create a session-scoped implementation plan.

**Purpose**

From the moment you decide to create a plan, you need to thoroughly explore and devise the best approach to complete the task.

During this process, you may need to gather information, such as searching code repositories, reading documents, and conducting web searches. You can also ask users questions to better understand the task.

Once you have gathered enough information, you need to write a detailed task completion plan into `state.planPath`.

If investigation shows the work changes requirements, public APIs, schemas, protocols, persistence formats, user-visible behavior, or ownership boundaries, stop and upgrade to a Proposal.

**After the tool returns**

1. Read `state.planPath`, it is a pre-generated markdown templated file with YAML frontmatter and some headings.
2. To achieve the user's goals, you can make full use of the tools at your disposal to create a plan.
3. After thorough research, write your complete plan into that file. Keep the existing YAML frontmatter intact and the existing headings.

**Plan contents**

Keep these sections meaningful and concise:

- 任务目标/Goal
- 范围边界/Scope
- 关键约束/Constraints
- 方案取舍/Trade-offs
- 实施步骤/Steps
- 验证方式/Verification

**After plan written**

Users will review it, provide feedback to you, or even modify the plan file themselves. After the user approves the plan, reread the latest plan file before implementation.
