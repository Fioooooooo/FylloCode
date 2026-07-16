---
sidebar:
  group: Product Features
  groupOrder: 20
  order: 10
---

# Feature Overview

FylloCode is not organized like a generic chat tool. Its features follow the governance path of one Agent coding task.

## Product Path

| Page | Problem Solved |
| --- | --- |
| [Project Overview](/en/docs/features/overview) | The default project entry point, collecting governance status, active changes, recent lineage, and specification evolution. |
| [Task Board](/en/docs/features/task) | A central task entry point for local tasks and tasks from connected engineering systems. |
| [Chat and Execution](/en/docs/features/chat) | Align with Agents in one project context, create plans, and move execution forward. |
| [Proposal Review](/en/docs/features/proposal) | Review proposal, design, and tasks, then run Apply & Archive. |
| [Workflow Orchestration](/en/docs/features/workflow) | Use YAML to codify your approved execution stages and Agent assignments. |
| [Knowledge](/en/docs/features/knowledge) | Browse project-level knowledge the Agent flags and captures after user confirmation. |
| [Guidelines](/en/docs/features/guidelines) | Browse the project engineering conventions the Agent maintains. |
| [Specs](/en/docs/features/specs) | Browse OpenSpec capability specs synced after a Proposal is archived. |
| [Work Lineage](/en/docs/features/lineage) | Browse every project lineage subject and trace Plans, Proposals, and Commits by Session. |
| [ACP Agents](/en/docs/features/agents) | Install, detect, and manage Coding Agents that support ACP. |
| [Engineering Integrations](/en/docs/features/integrations) | Connect engineering systems such as Yunxiao and write task results back to the existing toolchain. |
| [Settings](/en/docs/features/settings) | Manage application preferences, ACP Agents, service connections, and version information. |

## How to Read It

Start from a Task, decide in Chat whether this change should take the [direct, Plan, or Proposal](/en/docs/guide/workflow) path, then follow Apply & Archive — these are the pages you'll use day to day. Knowledge, Guidelines, Specs, and Work Lineage are background knowledge: `fyllo-cortex` helps the Agent maintain the first two at explicit checkpoints, Specs is the formal contract left after a Proposal archives, and Work Lineage is the full browsing entry for the [lineage](/en/docs/guide/lineage) that connects every step on the main path. ACP Agents, engineering integrations, and Settings are supporting capabilities.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-detail.png" alt="Proposal detail screenshot" />
</figure>
