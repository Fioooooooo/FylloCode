---
sidebar:
  group: Product Features
  groupOrder: 20
  order: 10
---

# Feature Overview

FylloCode organizes its features around the governance path of an Agent coding task inside a Workspace.

## Product Path

| Page | Problem Solved |
| --- | --- |
| [Project Overview](/en/docs/features/overview) | The default Workspace entry point, aggregating governance status, active changes, recent lineage, and specification evolution by Project. |
| [Multi-root Workspace](/en/docs/features/multi-root-workspace) | Organize multiple Projects in one window so an Agent can read multiple project directories within the authorized scope. |
| [Task Board](/en/docs/features/task) | A central task entry point for local tasks and tasks from connected engineering systems. |
| [Chat and Execution](/en/docs/features/chat) | Align with Agents inside a fixed Workspace Session scope, create plans, and move execution forward. |
| [Proposal Review](/en/docs/features/proposal) | Review proposal, design, and tasks, then run Apply & Archive. |
| [Workflow Orchestration](/en/docs/features/workflow) | Use YAML to codify your approved execution stages and Agent assignments. |
| [Knowledge](/en/docs/features/knowledge) | Browse Workspace-level knowledge the Agent flags and captures after user confirmation. |
| [Guidelines](/en/docs/features/guidelines) | Browse the engineering conventions maintained by each Project repository. |
| [Specs](/en/docs/features/specs) | Browse OpenSpec capability specs by Project after a Proposal is archived. |
| [Work Lineage](/en/docs/features/lineage) | Browse every Workspace lineage subject and trace Plans, Proposals, and Commits by Session. |
| [ACP Agents](/en/docs/features/agents) | Install, detect, and manage Coding Agents that support ACP. |
| [Engineering Integrations](/en/docs/features/integrations) | Connect engineering systems such as Yunxiao and write task results back to the existing toolchain. |
| [Settings](/en/docs/features/settings) | Manage application preferences, ACP Agents, service connections, and version information. |

## How to Read It

Start from a Task and decide in Chat whether this change should take the [direct, Plan, or Proposal](/en/docs/guide/workflow) path. Then follow Apply & Archive through the same main path. Knowledge, Guidelines, Specs, and Work Lineage provide background: `fyllo-cortex` helps the Agent maintain the first two at explicit checkpoints, Specs is the formal contract left after a Proposal archives, and Work Lineage lets you browse the [lineage](/en/docs/guide/lineage) that connects the path. ACP Agents, engineering integrations, and Settings support this workflow.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/proposal-detail.png" alt="Proposal detail screenshot" />
</figure>
