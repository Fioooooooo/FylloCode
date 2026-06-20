---
sidebar:
  group: Reference
  order: 20
---

# fyllo-specs MCP

`fyllo-specs` is a built-in MCP server in FylloCode. Around OpenSpec, it provides project specification exploration, Proposal creation, Apply execution, and Archive capabilities.

## Tool List

`fyllo-specs` registers only four tools:

| Tool | Purpose |
| --- | --- |
| `explore` | Enter exploration mode and read project specs plus active change state. |
| `create-proposal` | Create a change and generate proposal, design, specs, and tasks. |
| `apply-change` | Read artifacts of a specified change and implement according to tasks. |
| `archive-change` | Complete archive, move the change into archive, and handle workspace finalization. |

## Response Shape

By default, tool responses contain two sections:

- `<tool_instruction>`: workflow instruction for the tool
- `<state>`: JSON describing current project or change state

When `includeInstruction: false` is passed, only JSON state is returned. Do not disable instructions on first use, because instructions are part of the current tool behavior contract.

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
