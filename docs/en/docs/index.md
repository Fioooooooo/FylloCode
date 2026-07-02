---
sidebar:
  group: Guides
  groupOrder: 10
  order: 10
  text: Overview
---

# Documentation

FylloCode is a desktop app for teams that use Coding Agents. It does not replace your IDE, CI/CD, or project management system. It adds a persistent, structured, and traceable governance layer above those tools.

These docs answer three questions:

- Why ordinary Agent sessions are hard to use for long-term team collaboration
- How to split one coding task into a reviewable, executable, and archivable workflow
- How to start using FylloCode locally

## Recommended Reading Order

1. [Why FylloCode](/en/docs/guide/why)
2. [Getting Started](/en/docs/guide/getting-started)
3. [Four-Stage Workflow](/en/docs/guide/workflow)
4. [Lineage Traceability](/en/docs/guide/lineage)

To contribute to the project, continue with the [Contributing Guide](/en/docs/contributing) and [Developing FylloCode with FylloCode](/en/docs/guide/develop-with-fyllocode).

## Core Concepts

| Concept | Description |
| --- | --- |
| Task | The entry point of the main path. It can be created by a team member or synced from an engineering system. |
| Chat | The stage for clarifying intent, inspecting evidence, comparing tradeoffs, and converging on a decision with an Agent. |
| Proposal | A review artifact that usually contains proposal, design, specs, and tasks. |
| Apply & Archive | The implementation stage inside an approved task boundary, followed by archiving decisions, results, spec updates, and guideline evolution. |
| [lineage](/en/docs/guide/lineage) | A traceable path across the stages of one change, so archived outcomes can inform future tasks. |
| fyllo-specs | The built-in MCP server that exposes OpenSpec-based project specifications and change workflows. |
| fyllo-cortex | The built-in MCP server that provides guidelines and lineage tools for maintaining conventions and tracing design decisions. |
