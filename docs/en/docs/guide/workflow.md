---
sidebar:
  group: Guides
  order: 40
---

# Four-Stage Workflow

FylloCode splits each coding task into four stages along one main path: Task, Chat, Proposal, and Apply & Archive. Each stage has clear inputs, artifacts, and constraints. Every input, decision, and artifact is recorded into one [lineage](/en/docs/guide/lineage), and archived outcomes become context for the next task.

<figure class="fc-doc-image">
  <img src="/assets/diagrams/workflow.svg" alt="FylloCode four-stage workflow diagram" />
</figure>

## Task

Task is the starting point of the main path and the entry point for a work item entering governance.

A Task can be created directly by a team member or synced from a connected engineering system. FylloCode does not add extra constraints here. It only collects the task as the shared anchor for the later stages.

## Chat

The Chat stage makes the plan clear before an Agent writes code.

For a concrete task, the Agent should:

- Analyze requirements and clarify the problem and boundary.
- Inspect code evidence to validate feasibility and impact scope.
- Guide the team through tradeoffs between candidate options.
- Converge on a final decision with you instead of inventing a plan in isolation.

The stage should clarify change scope, existing project constraints, historical background, acceptance criteria, risks, assumptions, and open questions. The key is to avoid implementation while the target is unclear. Accepted and rejected ideas are both kept as part of lineage.

## Proposal

Proposal turns decisions confirmed in Chat into structured, reviewable artifacts.

By default, Proposal generates four OpenSpec-oriented artifacts:

- `proposal.md`: background, capability changes, affected modules
- `design.md`: goals, non-goals, key design decisions, rejected options
- `specs`: specification entries captured from the change
- `tasks.md`: task list for the Apply stage

These artifacts support the current review and future traceability. If someone asks two months later why the design was chosen, the answer should be in proposal and design.

## Apply & Archive

Apply & Archive executes the approved `tasks.md` and preserves the complete record after the change lands.

During execution, the Agent should:

- Read Proposal artifacts and project rules.
- Modify code only inside the approved task boundary.
- Follow the task list.
- Add necessary tests and verification results.
- Avoid mixing unreviewed new plans into implementation.

FylloCode supports a linked worktree workflow by default, so code changes can happen in an isolated workspace while the main branch stays clean until the task is complete.

After the change lands, the complete record is archived. The archive includes:

- Code change scope
- Proposal and Design decision context
- Spec updates
- Guideline evolution
- Execution and verification results

Archive closes the lineage loop. The next Agent session no longer starts from zero. It can read existing specs, historical decisions, and team conventions, then continue from the real project state.

## Model Selection Advice

Different stages need different model capabilities:

| Stage | Recommendation |
| --- | --- |
| Chat / Proposal | Use a model with stronger reasoning, because the focus is understanding project context, comparing options, and writing reviewable artifacts. |
| Apply | A faster and lower-cost model may be enough because the task boundary is already made explicit by `tasks.md`. |

A common setup is to use a stronger reasoning model for Chat and Proposal, then use a faster and more cost-efficient model for Apply.
