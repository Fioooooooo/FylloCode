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

## Page Structure

The page separates two information groups. The dynamic work area on the left shows active Proposals and recent lineage, while the static governance area on the right shows governance health, specification growth, and guideline evolution. Narrow windows stack the groups without mixing their responsibilities.

## Governance Health

The governance health card uses a ring to show the percentage of lineage subjects linked to tasks. Subjects that started in Chat and received a task later are included. When the project has no lineage, the card reports that there is nothing to evaluate yet.

Five governance entries appear below the ring:

| Entry | Measure and destination |
| --- | --- |
| Capability Specs | Counts specs under `openspec/specs/` and opens `/specs`. |
| Archived Proposals | Counts archives under `openspec/changes/archive/` and opens `/proposal`. |
| Project Guidelines | Recursively counts `guidelines/**/*.md` and opens `/guidelines`. |
| Durable Knowledge | Counts knowledge entries and scan errors and opens `/knowledge`. |
| Work Lineage | Shows the total number of project lineage subjects and opens `/lineage`. |

Loading or failure in the Durable Knowledge summary affects only that entry, not the main Overview data. If an entry is `suspect` or `unknown`, or a scan error exists, an alert icon and accessible text report the number that needs attention.

## Active Changes

This section shows active, unarchived Proposals in the current project. Each item reports `creating`, `draft`, or `applying` and uses lineage to identify the source task. A Proposal in a linked worktree also shows an indicator that reveals the full worktree path. Click an item to open the [Proposal detail](/en/docs/features/proposal).

## Recent Lineage

The latest 10 lineage subjects are listed by update time. Each item shows:

- Origin: task-based or chat-based
- Linked task title and task reference
- Number of connected Chat sessions and produced proposals
- Proposal status information

Use this section for a quick view of recent work. To browse every subject, filter by state, or inspect Plans, Proposals, and Commits by Session, open [Work Lineage](/en/docs/features/lineage). See [Lineage Traceability](/en/docs/guide/lineage) for how lineage is created and connected.

## Governance Evolution

Git history is used to show long-term trends in project rules:

- **Spec growth**: weekly trend of spec count over the last 8 weeks, reflecting how fast behavior rules are being captured.
- **Guideline evolution**: latest 5 updated guideline files under `guidelines/`, including file, time, and commit message.

## Data Scope and Refreshing

- Repository scanning and lineage projections are read live when the page opens.
- Git history is cached per project for 60 seconds to avoid repeated command execution.
- If the project has no `openspec/`, no `guidelines/`, or is not a git repository, the related block is empty while the rest of the page continues to work.
