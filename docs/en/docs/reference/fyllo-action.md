---
sidebar:
  group: Reference
  order: 35
---

# fyllo-action

`fyllo-action` is the structured channel through which an ACP Agent interacts with FylloCode. The Agent writes a specific tag into its reply text, FylloCode renders it as an interactive card, and once you confirm it FylloCode takes over the follow-up action — instead of the Agent continuing to describe the outcome in prose.

This channel exists because some actions (creating a task, opening a plan for review, asking you to confirm a knowledge entry) can't be reliably confirmed or traced if the Agent only describes them in text like "I've created...". `fyllo-action` turns these actions into an explicit interaction you can confirm or cancel.

## Four Action Types

| Type | Where it appears | Triggered when | What happens after confirmation |
| --- | --- | --- | --- |
| `task.create` | Inline card in the chat transcript | The Agent identifies a follow-up task worth tracking | FylloCode creates a local task and binds the current session to that task's lineage |
| `plan.create` | Inline card in the chat transcript | The Agent finishes writing a [Plan](/en/docs/guide/workflow#plan) document | FylloCode opens the plan for your review; once approved, the Agent implements it |
| `knowledge.flag` | Inline chat card + read-only event-rail entry | The Agent notices a fact worth capturing during discussion | Doesn't interrupt the conversation; once you confirm the inline card, all pending flags in the session are bundled into one capture request |
| `knowledge.review` | Inline chat card + read-only event-rail entry | The Agent completes a knowledge capture that created or updated an entry | FylloCode opens that entry's latest saved content from disk for editing and review |

All four actions provide a confirmation entry point in the chat transcript. `task.create` and `plan.create` appear only as inline cards. `knowledge.flag` and `knowledge.review` are also collected in the collapsible session event rail so pending items are easy to find. The rail itself is a read-only list and does not provide confirmation or capture buttons.

## Boundary with the Agent

The Agent only produces the structured action tag and its required fields — it does not perform the action itself:

- It doesn't create the task file itself; it waits for `task.create` to be confirmed
- It doesn't paste the plan or knowledge entry body into the chat; it references the file for FylloCode to open
- Each action type has explicit payload constraints (for example, at most one `task.create` per session, at most one pending `knowledge.review` card per entry) to keep the same kind of card from flooding a single session

## Relationship with lineage

Once `task.create` is confirmed and the task is created, the current session is linked back to that task's [lineage](/en/docs/guide/lineage) subject, so a discussion that started as free-form chat can still join the traceable main path. A Plan is already attached to the current Session through an MCP event during `create-plan`; `plan.create` only opens the review and does not create a duplicate link. `knowledge.flag` and `knowledge.review` do not create separate lineage links.

## Why this matters

Understanding `fyllo-action` explains behavior like "why didn't the Agent just create the task for me" or "why wasn't that knowledge entry saved immediately" — these actions are designed to require your confirmation rather than letting the Agent decide unilaterally.
