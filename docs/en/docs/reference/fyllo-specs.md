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
| `explore` | Enter exploration mode and read authorized Workspace specs plus active change state. |
| `create-plan` | Create a session-scoped plan for exploratory or architectural work that doesn't change the behavior contract. |
| `create-proposal` | Create a change and generate proposal, design, specs, and tasks. |
| `apply-change` | Read artifacts of a specified change and implement according to tasks. |
| `archive-change` | Complete archive, move the change into archive, and handle workspace finalization. |

`create-plan` and `create-proposal` correspond to the Plan and Proposal paths in the [three execution paths](/en/docs/guide/workflow); direct implementation calls neither.

## Response Shape

By default, tool responses contain two sections:

- `<tool_instruction>`: workflow instruction for the tool
- `<state>`: JSON describing current Workspace, Project, or change state

When `includeInstruction: false` is passed, only JSON state is returned. Do not disable instructions on first use, because instructions are part of the current tool behavior contract.

## create-plan

`create-plan` accepts two input fields:

| Field | Description |
| --- | --- |
| `goal` | One-sentence summary of what this plan aims to achieve |
| `slug` | Kebab-case short identifier. Do not include a date prefix; the tool adds `yyyy-MM-dd-` automatically |

The plan document is written to `<workspaceDataDir>/sessions/<sessionId>/plans/<yyyy-MM-dd-slug>.md`. It belongs to the current session, is not written into any Project repository, and does not create a linked worktree. The tool only generates a template file with frontmatter and heading skeleton; the plan body is written by the Agent after investigation.

If the investigation reveals that the change affects requirements, a public API, a schema, a protocol, a persistence format, user-visible behavior, or an ownership boundary, stop refining this plan and call `create-proposal`. Do not finish the plan first and start a separate proposal afterward.

## worktreeMode and Project Ownership

`create-proposal` supports `worktreeMode` and can use `folderId` to select the owning Project:

| Value | Description |
| --- | --- |
| `linked` | Default mode. If the owning Project is a git repository, create or reuse `.worktrees/<changeName>` linked worktree. |
| `main` | Create the proposal directly in the owning Project's main worktree without creating a linked worktree. |

A single-Project activation may omit `folderId`; a multi-root Workspace must provide it explicitly. `apply-change` and `archive-change` require the `folderId` from the ProposalRef and resolve a fixed target inside the server; callers cannot provide `targetPath` or `worktreePath`.

If the owning Project is not a git repository, `linked` mode falls back to the main worktree and explains the reason in state warnings.

## OpenSpec Initialization

When the target Project lacks the minimum OpenSpec structure, `create-proposal` creates:

- `openspec/config.yaml`
- `openspec/specs/`
- `openspec/changes/archive/`

An existing `openspec/config.yaml` is treated as Project-owned and remains unchanged. The default guideline task rule is seeded only when the file is first created. Regardless of config contents, the current instruction returned by `create-proposal` requires the Agent to decide while writing `tasks.md` whether a concrete guideline update task is needed.

## Bundled Transport and Context

Inside the FylloCode application, `fyllo-specs` is hosted by an application-level bundled MCP host in the main process. ACP Agents that declare HTTP MCP capability connect through a stable loopback proxy; each Workspace MCP activation receives its own capability, and the proxy validates the server scope before injecting Workspace v2 context. stdio receives the same frozen descriptor through `FYLLO_WORKSPACE_JSON`.

The real HTTP backend port remains private to the main process, so a backend restart does not change the proxy URL already supplied to an Agent. The proxy strips caller-supplied `Authorization` and `X-Fyllo-*` headers so an Agent cannot forge Workspace or Project context. When an Agent lacks HTTP support, the target backend is not ready, or the HTTP host is unavailable, FylloCode falls back to stdio. Neither transport falls back to cwd or legacy Project-path context. Setting `FYLLO_DISABLE_BUNDLED_MCP=1` disables both the HTTP host and stdio spec injection.

## Usage Boundary

`fyllo-specs` is for Agent workflows, not a general project management API. Its value is organizing project rules, change artifacts, and execution stages into a process Agents can follow.
