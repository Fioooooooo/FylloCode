---
sidebar:
  group: Product Features
  order: 20
---

# Project Overview

Project Overview is the default first screen after opening a project. It brings governance status, active changes, recent lineage, and specification evolution into one page so you can see the real project state before starting new work.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/project-overview.png" alt="Project overview screenshot" />
</figure>

All page data comes from the local project: repository scanning, git history, and lineage projections. It does not depend on external services.

## Stat Cards

The four cards at the top answer "how governed is this project":

| Card | Meaning |
| --- | --- |
| Capability Specs | Number of specs under `openspec/specs/`, plus new specs added this month. |
| Archived Proposals | Number of archived changes under `openspec/changes/archive/`, plus new archives added this month. |
| Project Guidelines | Number of Markdown files under `guidelines/`, plus the latest update time. |
| Lineage Coverage | Ratio of lineage subjects linked to tasks, plus total lineage count. |

Lineage coverage counts whether a subject is linked to a task. A subject that started from Chat and later created a task is included. A higher value means more team changes enter the governance flow through explicit task anchors.

## Active Changes

This section shows active, unarchived proposals in the current project. Each item displays its stage: drafting, proposal, or applying. It also uses lineage to identify which task produced it. Click an item to open the [Proposal detail](/en/docs/features/proposal).

## Recent Lineage

The latest 10 lineage subjects are listed by update time. Each item shows:

- Origin: task-based or chat-based
- Linked task title and task reference
- Number of connected Chat sessions and produced proposals
- Merge state: `applying` when a proposal is in progress, otherwise `pending`

This is the entry point for seeing where a requirement currently is. See [Lineage Traceability](/en/docs/guide/lineage) for how lineage is created and connected.

## Governance Evolution

Git history is used to show long-term trends in project rules:

- **Spec growth**: weekly trend of spec count over the last 8 weeks, reflecting how fast behavior rules are being captured.
- **Guideline evolution**: latest 5 updates under `guidelines/`, including file, time, and commit message.

## Data Scope and Refreshing

- Repository scanning and lineage projections are read live when the page opens.
- Git history is cached per project for 60 seconds to avoid repeated command execution.
- If the project has no `openspec/`, no `guidelines/`, or is not a git repository, the related block is empty while the rest of the page continues to work.
