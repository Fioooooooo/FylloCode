---
sidebar:
  group: Reference
  order: 20
---

# fyllo-specs MCP

`fyllo-specs` is a built-in MCP server in FylloCode. It started as a thin wrapper around the OpenSpec CLI, later gained linked worktree management, and then gained `create-plan`, so the Plan path in the [three execution paths](/en/docs/guide/change-paths) is also carried by this server.

## Tool List

`fyllo-specs` registers five tools:

| Tool | Purpose |
| --- | --- |
| `explore` | Enter exploration mode and read authorized Workspace specs plus active change state. |
| `create-plan` | Create a session-scoped plan for exploratory or architectural work that doesn't change the behavior contract. |
| `create-proposal` | Create a change and generate proposal, design, specs, and tasks. |
| `apply-change` | Read artifacts of a specified change and implement according to tasks. |
| `archive-change` | Complete archive, move the change into archive, and handle workspace finalization. |

`create-plan` and `create-proposal` correspond to the Plan and Proposal paths in the [three execution paths](/en/docs/guide/change-paths); direct implementation calls neither.

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

`create-plan` uses only Workspace and Session context. It does not resolve, accept, or infer a `folderId` in either single-Project or multi-root Workspaces. A Plan can therefore cover multiple Projects authorized for the same Session, while identical slugs in different Workspaces or Sessions remain isolated in separate paths. Only repository-owned Proposal operations require an explicit Project owner.

If the investigation reveals that the change affects requirements, a public API, a schema, a protocol, a persistence format, user-visible behavior, or an ownership boundary, stop refining this plan and call `create-proposal`. Do not finish the plan first and start a separate proposal afterward.

## worktreeMode and Project Ownership

`create-proposal` supports `worktreeMode` and can use `folderId` to select the owning Project:

| Value | Description |
| --- | --- |
| `linked` | Default mode. If the owning Project is a git repository, create or reuse `.worktrees/<changeName>` linked worktree. |
| `main` | Create the proposal directly in the owning Project's main worktree without creating a linked worktree. |

A single-Project activation may omit `folderId`; a multi-root Workspace must provide it explicitly. `apply-change` and `archive-change` require the `folderId` from the ProposalRef and resolve a fixed target inside the server; callers cannot provide `targetPath` or `worktreePath`.

One cross-Project goal can produce several Proposals. The Agent chooses a path independently for each Project and, after you confirm an explicit owner set, calls `create-proposal` once for every Project that needs a Proposal. Each invocation handles one repository owner, supplies its `folderId`, and returns one `state.target`; it cannot combine several Projects into a primary-owned umbrella Proposal.

While creating artifacts, the Agent writes only the owning Project's proposal, design, specs, and tasks under the current `state.target.worktreePath`. When the workflow needs to change the top-level `.openspec.yaml` `status` to `draft`, the instruction requires reading the complete file, replacing only the unique top-level status value, and preserving every other field and value. If the file cannot be read or the status field is ambiguous, the Agent must stop instead of replacing metadata with a one-line document.

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

## OpenSpec Metadata Writes and Recovery

`fyllo-specs` uses the same `.openspec.yaml` serialization rules for Create, MCP Apply, and Archive. A status write preserves the other metadata fields and values, while ISO timestamps such as `created` remain unquoted YAML plain scalars. Existing active changes and historical archives are not rewritten in bulk; the unified representation applies when a later lifecycle operation writes the file.

`archive-change` writes `status: archived` to `.openspec.yaml` inside the archive directory only after OpenSpec explicitly confirms success. The write happens before the Git commit, linked-worktree merge, and cleanup, so the durable archive status is included in later finalization. Preview, conflict, CLI failure, and output without a success marker do not update metadata.

If OpenSpec has already moved the change and synced specs but the metadata write fails, the tool preserves the partial-success fact as `archive.ok: true`, stops Git finalization, and returns `archive-metadata-update` recovery. Do not run OpenSpec Archive again in this state. Repair the archived metadata, then continue with commit, merge, and cleanup. Historical archives are not rewritten in bulk; FylloCode still treats their archive-directory location as authoritative when old metadata says `status: applying`.

## Usage Boundary

`fyllo-specs` is for Agent workflows, not a general project management API. Its value is organizing project rules, change artifacts, and execution stages into a process Agents can follow.
