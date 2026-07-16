---
sidebar:
  group: Guides
  order: 20
---

# Why FylloCode

After each Agent session ends, the code remains, but many important decisions do not.

## Common Problems

**Three days later, nobody knows why a line changed.**  
Agents can modify hundreds of files in one run. `git blame` tells you who committed the code, but not the task context, constraints, or tradeoffs behind it.

**Two months later, nobody knows the design rationale.**  
When one architecture direction is chosen, the reasons for rejecting other options often disappear with the chat window.

**Every new session rebuilds context from scratch.**  
The same project boundaries, historical decisions, and forbidden operations have to be explained repeatedly to new Agent instances.

**Each team member's Agent follows different rules.**  
Without shared engineering rules and cross-session consistency, team conventions get fragmented by personal habits and one-off prompts.

## FylloCode's Approach

FylloCode puts Agent coding tasks into a governable workflow:

- Task collects the work item into one shared entry point, whether it was created directly or came from an engineering system.
- Chat clarifies intent, inspects evidence, compares tradeoffs, and confirms decisions with the Agent.
- Depending on whether the change touches a contract, it goes straight to implementation, becomes a lightweight Plan, or turns into a Proposal with rationale, design tradeoffs, and an executable task breakdown.
- Apply & Archive executes within the approved boundary, then preserves change records, guidelines, and spec updates when the contract changed.

The path is connected by lineage, and the captured rules become the starting context for the next task.

The goal is not ceremony. The goal is to answer a practical engineering question weeks or months later: can we still explain why this Agent-driven change was made this way?

## When It Fits

FylloCode is most useful when:

- Your team already uses multiple Coding Agents or models.
- The project needs long-term maintenance and design decisions cannot live only in chat history.
- The codebase has clear architecture boundaries, IPC rules, storage formats, test requirements, and release constraints.
- Changes should go through design review before an Agent edits the main branch.

For one-off scripts or temporary experiments, a normal Agent session may be enough. FylloCode focuses on governance and traceability in continuous engineering collaboration.
