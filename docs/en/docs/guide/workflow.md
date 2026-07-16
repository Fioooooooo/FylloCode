---
sidebar:
  group: Guides
  order: 40
---

# Three Execution Paths

FylloCode does not force one pipeline. After Task and Chat, you and the Agent need to decide which execution path this change should take.

| Path | Fits when | Produces |
| --- | --- | --- |
| Direct implementation | Scope is clear, no architectural tradeoffs, no change to any external contract | The code change itself |
| Plan | Needs upfront thinking or comparing options, but the behavior contract stays the same | A session-scoped plan document |
| Proposal | Changes a public API, schema, protocol, persistence format, user-visible behavior, or ownership boundary | The proposal, design, specs, and tasks artifact set |

These are not three separate entry points — they are escalation steps within the same discussion. Decide whether a Plan is needed first; if writing the plan reveals a contract change, escalate to a Proposal. Every input, decision, and artifact along the way is recorded into the same [lineage](/en/docs/guide/lineage).

## Why not a fixed pipeline

FylloCode originally treated the OpenSpec proposal as the only execution path: every change had to go through the full proposal, design, specs, and tasks artifact set before implementation. In practice this was too heavy for small changes — fixing a copy string or tuning a parameter still required the full review artifact set, so teams worked around it.

The current approach lets the nature of the change decide whether review weight is needed, instead of the process mandating it. Only changes that actually touch the contract require Proposal-level review; everything else can move through a lighter path while still landing on the same lineage trail.

## Direct implementation

The Agent modifies code directly after the plan is confirmed in Chat, without calling `create-plan` or `create-proposal` on `fyllo-specs`.

Fits when:

- The scope is obvious at a glance and doesn't need a recorded design tradeoff
- Nothing about requirements, public APIs, schemas, protocols, persistence formats, or user-visible behavior changes
- The change can merge without a team review

## Plan

A Plan is a lightweight, session-scoped implementation plan written to a Markdown file under the current session's directory. It does not depend on the OpenSpec structure and does not create a linked worktree.

Fits work that needs upfront thinking or tradeoff comparison, but is confirmed not to change the behavior contract:

- Goal, scope boundary, key constraints
- Tradeoffs
- Implementation steps
- Verification approach

After the Agent writes the plan, it hands it to you for review through a `plan.create` [fyllo-action](/en/docs/reference/fyllo-action) card. Once you confirm, FylloCode opens that plan document for you to read and approve, and the Agent proceeds to implement the approved plan.

### When a Plan must escalate to a Proposal

While writing the plan, if it turns out the change actually touches any of the following, stop and switch to `create-proposal` instead of finishing the plan:

- Changes requirements or feature scope
- Changes a public API
- Changes a schema or persistence format
- Changes a protocol (e.g. an IPC contract)
- Changes user-visible behavior
- Changes a module's ownership boundary

There is no middle ground here: matching even one of these means escalating immediately — not "implement from the plan first and backfill a proposal later."

## Proposal

Proposal targets changes that touch an external contract. It generates four OpenSpec-oriented artifacts:

- `proposal.md`: background, capability changes, affected modules
- `design.md`: goals, non-goals, key design decisions, rejected options
- `specs`: specification entries captured from the change
- `tasks.md`: task list for the Apply stage

These artifacts support the current review and future traceability. If someone asks two months later why the design was chosen, the answer should be in proposal and design.

By default, `create-proposal` creates a linked worktree under `.worktrees/<changeName>`, so the change happens in an isolated workspace while the main branch stays clean until review passes. It only creates the proposal directly in the main workspace when the user explicitly asks for that.

## Apply & Archive

Whichever path was taken — direct implementation, Plan, or Proposal — the change can move into Archive once it lands, preserving the change scope, decision context, spec updates (if any), and guideline evolution as background for the next task.

For the Proposal path, the Apply stage executes `tasks.md`. The Agent should:

- Read Proposal artifacts and project rules
- Modify code only inside the approved task boundary
- Follow the task list
- Add necessary tests and verification results
- Avoid mixing unreviewed new plans into implementation

After the change lands, the complete record is archived. The archive includes:

- Code change scope
- Proposal and Design decision context (Proposal path)
- Spec updates (Proposal path)
- Guideline evolution
- Execution and verification results

Archive closes the lineage loop. The next Agent session no longer starts from zero. It can read existing specs, historical decisions, and team conventions, then continue from the real project state.

## Model Selection Advice

Different stages need different model capabilities:

| Stage | Recommendation |
| --- | --- |
| Chat / Plan / Proposal | Use a model with stronger reasoning, because the focus is understanding project context, comparing options, and writing reviewable artifacts. |
| Apply | A faster and lower-cost model may be enough because the task boundary is already made explicit by the plan or `tasks.md`. |

A common setup is to use a stronger reasoning model for Chat, Plan, and Proposal, then use a faster and more cost-efficient model for Apply.
