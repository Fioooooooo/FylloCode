---
sidebar:
  group: Reference
  order: 20
---

# fyllo-specs MCP

`fyllo-specs` is a built-in MCP server in FylloCode. It started as a thin wrapper around the OpenSpec CLI, later gained linked worktree management, and then gained `create-plan`, so the Plan path in the [three execution paths](/en/docs/guide/workflow) is also carried by this server.

## Tool List

`fyllo-specs` registers five tools:

| Tool | Purpose |
| --- | --- |
| `explore` | Enter exploration mode and read project specs plus active change state. |
| `create-plan` | Create a session-scoped plan for exploratory or architectural work that doesn't change the behavior contract. |
| `create-proposal` | Create a change and generate proposal, design, specs, and tasks. |
| `apply-change` | Read artifacts of a specified change and implement according to tasks. |
| `archive-change` | Complete archive, move the change into archive, and handle workspace finalization. |

`create-plan` and `create-proposal` correspond to the Plan and Proposal paths in the [three execution paths](/en/docs/guide/workflow); direct implementation calls neither.

## Response Shape

By default, tool responses contain two sections:

- `<tool_instruction>`: workflow instruction for the tool
- `<state>`: JSON describing current project or change state

When `includeInstruction: false` is passed, only JSON state is returned. Do not disable instructions on first use, because instructions are part of the current tool behavior contract.

## create-plan

`create-plan` accepts two input fields:

| Field | Description |
| --- | --- |
| `goal` | One-sentence summary of what this plan aims to achieve |
| `slug` | Kebab-case short identifier, must not include a date prefix — the tool adds a `yyyy-MM-dd-` prefix automatically |

The plan document is written to `<projectDataDir>/sessions/<sessionId>/plans/<yyyy-MM-dd-slug>.md`. It belongs to the current session, is not written into the project repository, and does not create a linked worktree. The tool only generates a template file with frontmatter and heading skeleton; the plan body is written by the Agent after investigation.

If the investigation reveals the change affects requirements, a public API, a schema, a protocol, a persistence format, user-visible behavior, or an ownership boundary, stop refining this plan and call `create-proposal` instead — don't finish the plan and start a separate proposal afterward.

## workspaceMode

`create-proposal` supports `workspaceMode`:

| Value | Description |
| --- | --- |
| `linked` | Default mode. If the target is a git project, create or reuse `.worktrees/<changeName>` linked worktree. |
| `main` | Create the proposal directly in the main workspace without creating a linked worktree. |

If the target path is not a git project, `linked` mode falls back to the main workspace and explains the reason in state warnings.

## OpenSpec Initialization

When the target project lacks the minimum OpenSpec structure, `create-proposal` creates:

- `openspec/config.yaml`
- `openspec/specs/`
- `openspec/changes/archive/`

An existing `openspec/config.yaml` is preserved. If the default guidelines evaluation rule is missing, the tool appends it while preserving other fields.

## Usage Boundary

`fyllo-specs` is for Agent workflows, not a general project management API. Its value is organizing project rules, change artifacts, and execution stages into a process Agents can follow.
