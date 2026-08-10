---
sidebar:
  group: Guides
  groupOrder: 10
  order: 10
  text: Overview
---

# Documentation

FylloCode is a desktop app for engineering work that uses Coding Agents. It does not replace your IDE, CI/CD, or project management system. It adds a persistent, structured, and traceable governance layer above those tools.

These docs answer three questions:

- Why ordinary Agent sessions are hard to use for long-term engineering collaboration
- How to split one coding task into a reviewable, executable, and archivable workflow
- How to start using FylloCode locally

## Recommended Reading Order

1. [Why FylloCode](/en/docs/guide/why)
2. [Getting Started](/en/docs/guide/getting-started)
3. [Three Execution Paths](/en/docs/guide/change-paths)
4. [Lineage Traceability](/en/docs/guide/lineage)

To contribute to the project, continue with the [Contributing Guide](/en/docs/contributing) and [Developing FylloCode with FylloCode](/en/docs/guide/develop-with-fyllocode).

## Core Concepts

| Concept | Description |
| --- | --- |
| Task | The entry point of the main path. It can be created locally or synced from an engineering system. |
| Chat | The stage for clarifying intent, inspecting evidence, comparing tradeoffs, converging on a decision with an Agent, and deciding which execution path this change should take. |
| Plan | A session-scoped, lightweight implementation plan for work that needs upfront thinking but doesn't change the behavior contract; escalates to a Proposal the moment a contract change is found. |
| Proposal | A review artifact for contract-changing work, usually containing proposal, design, specs, and tasks. |
| Apply & Archive | The implementation stage inside an approved boundary, followed by archiving decisions, results, spec updates (when applicable), and guideline evolution. |
| [guideline](/en/docs/features/guidelines) | A project's own engineering conventions, self-maintained by the Agent at checkpoints in Chat, Apply, and Archive to stay in sync with the real code. |
| Project / Workspace | A Project is one repository member; a Workspace is the working context that can contain up to 16 Projects. |
| [knowledge](/en/docs/features/knowledge) | Workspace-level facts shared across Projects, tasks, and sessions, identified and captured by the Agent using a judgment test (the "flag test"). |
| [lineage](/en/docs/guide/lineage) | A traceable path across the stages of one change, so archived outcomes can inform future tasks. |
| [fyllo-action](/en/docs/reference/fyllo-action) | The structured channel an ACP Agent uses to interact with FylloCode, for task creation, plan review, and knowledge flag/review. |
| fyllo-specs | The built-in MCP server that exposes Project-owned OpenSpec specifications, Plan, and Proposal workflows. |
| fyllo-cortex | The built-in MCP server that provides guidelines, knowledge, and lineage tools for accumulating project engineering knowledge and tracing design decisions. |
| [fyllo-spawn](/en/docs/reference/fyllo-spawn) | An HTTP-only built-in MCP server that lets the current Chat Agent delegate focused work to other installed ACP Agents and query background status and results. |
