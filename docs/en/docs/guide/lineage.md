---
sidebar:
  group: Guides
  order: 50
---

# Lineage Traceability

Lineage is the mechanism behind FylloCode's end-to-end traceability. A requirement is recorded from creation, discussion, planning, implementation, and archive as one traceable path. The [four-stage workflow](/en/docs/guide/workflow) defines how a change moves. Lineage records what actually happened across that path.

## Core Concept: Subject

One trace in lineage is called a **subject**. A subject represents one requirement intent and contains:

| Field | Description |
| --- | --- |
| Origin | `task` or `chat`, recording whether the subject started from a task or directly from a chat. |
| Task snapshot | The linked task reference and snapshot, including source such as local or an engineering system. Chat-origin subjects start empty. |
| Links | All Chat sessions under this subject. Each session records the proposals it produced. |

One subject can connect multiple sessions and multiple proposals. If the same task is discussed multiple times and produces multiple changes, they belong to the same subject.

## How the Path Is Created

```text
Task --start discussion--> Chat Session --create-proposal--> Proposal --> Apply & Archive
 |                              |                         |
 +----------- same lineage subject -----------------------+
```

### 1. Starting from a Task

When discussion starts from a task card on the [Task Board](/en/docs/features/task), FylloCode creates or reuses a subject anchored to that task and binds the new session to it. The Chat page shows a **source task banner** at the top. Reopening the session still shows the banner.

Starting discussion again from the same task appends the new session to the same subject instead of creating a separate one.

### 2. Starting from Chat

When discussion starts directly from the [Chat page](/en/docs/features/chat), FylloCode creates a chat-origin subject once the conversation produces a final plan. It also shows a card for creating a task, helping you turn the plan into a local task.

If the conversation is only exploratory and does not produce a proposal, it is not counted as task-linked in lineage coverage.

### 3. Proposal Auto-Linking

When an Agent creates a proposal through the `create-proposal` tool from `fyllo-specs`, the proposal changeId is automatically recorded on the subject of that session. No manual linking is required. The subject naturally records which plan the discussion produced.

### 4. Creating a Task Later

A chat-origin subject can create a task after the conversation:

- In Chat, you can ask the Agent to propose a local task. It outputs a structured `fyllo-action` with `task.create`, and you confirm before FylloCode executes it.

The created task is written back to the same subject. The origin remains `chat`, but lineage coverage counts it as task-linked. This lets "talk first, then formalize the task" still enter the governance path.

## Data Storage

Lineage data is stored entirely in the local project data directory:

- Each subject is an independent JSON file at `lineage/subjects/<subjectId>.json`.
- A reverse lookup index at `lineage/index.json` maps task references, session IDs, and proposal changeIds back to subjects. The index can always be rebuilt from subject files.

There is no database and no external upload. Data stays local with the project data.

## Where Lineage Is Used

- **Chat page**: source task banner that identifies which task the session belongs to.
- **[Project Overview](/en/docs/features/overview)**: lineage coverage, recent subjects, and task lookup for active changes are based on lineage projections.
- **Archive traceability**: after a change is archived, FylloCode can trace from proposal back to session and task to answer "why did this change happen and what was discussed?"

## Why This Path Matters

`git blame` tells you who committed code. Lineage adds three missing answers:

- Which task this change came from and what problem it tried to solve.
- Which discussions happened and which plan they produced.
- Where the tradeoffs and rejected directions were recorded.

In ordinary Agent sessions, this information disappears with the chat window. In FylloCode, it is structured data on one subject and remains queryable months later.
