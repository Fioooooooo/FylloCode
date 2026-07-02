---
sidebar:
  group: Reference
  order: 30
---

# fyllo-cortex MCP

`fyllo-cortex` is a built-in MCP server in FylloCode. It currently provides two tools:

| Tool | Purpose |
| --- | --- |
| `guidelines` | Maintains project engineering conventions so later Agent sessions can read the current rules. |
| `lineage` | Traces code, commits, or proposals back to the task, session, and design-decision context behind them. |

## guidelines Tool

`guidelines` maintains project guidelines. Normal guideline reading does not go through this tool:

1. When a new Chat / Apply ACP session starts, FylloCode scans `guidelines/**/*.md` in the current workspace.
2. It builds a `<guidelines>` index from each file's frontmatter and injects that index into the system reminder.
3. The Agent uses the `path` values in that index to read the relevant guideline documents directly.

The Archive stage does not inject the `<guidelines>` index, but it still requires a final guideline checkpoint before archiving.

The current tool has three maintenance modes:

| mode | Returned Content | Modifies Files |
| --- | --- | --- |
| `init` | Bootstrap instructions plus current repository state for a project with no guidelines. | No |
| `create` | Creation instructions, the current index, and `AGENTS.md` state for a new convention. | No |
| `update` | Repair instructions, target file state, and the current index for an existing guideline. | No |

The tool does not generate or overwrite files directly. It returns `tool_instruction` and `state`; the Agent still edits files based on repository evidence.

Do not call the `guidelines` tool just to rediscover the index. The injected `<guidelines>` block is the read entry point. Call the tool only when bootstrapping, creating, or repairing guideline documents.

## Recommended File Structure

Guidelines in FylloCode projects usually include:

- Root `AGENTS.md`: entry instructions for Agents
- `guidelines/**/*.md`: detailed rules split by topic, optionally grouped into subdirectories

Common topics include:

- Architecture
- CodeStyle
- Testing
- DataModel
- IPC
- RendererProcess
- MainProcess
- Build
- DeveloperWorkflow
- Domain

## frontmatter

FylloCode parses YAML frontmatter at the top of guideline files to build the injected `<guidelines>` index.

Every guideline document should start with these fields:

```yaml
---
name: Architecture
description: System architecture, directory boundaries, and dependency direction
keywords: [architecture, electron, ipc]
---
```

Returned entries contain:

- `path`
- `name`
- `description`
- `keywords`
- `parseError` when frontmatter parsing or file reading fails

Files without frontmatter are still returned, with `name` falling back to the file name. They should still be repaired with complete frontmatter so Agents can decide from the index whether the document is relevant.

## Trigger Points

Guidelines are not triggered only by the `fyllo-cortex.guidelines` tool. FylloCode brings guideline maintenance into several parts of the workflow:

- **Chat**: the system reminder injects the `<guidelines>` index; before creating a Proposal, the Agent considers whether guidelines need to be created or updated; after direct implementation or approved Plan work, it performs the same check.
- **Proposal creation**: when `fyllo-specs` initializes or reuses an OpenSpec config, it appends the default task rule that asks `tasks.md` to evaluate local guideline updates.
- **Apply**: before editing code, the Agent reads relevant guidelines; if implementation reveals missing, stale, or conflicting guidelines, it calls the maintenance tool.
- **Archive**: before final archive, the Agent checks whether the completed change altered commands, architecture, tests, workflow, data contracts, or project conventions.
- **Project Health Check**: guideline health is reported separately from the score and handled directly with `init` / `create` / `update`, without going through Proposal.
- **Project Overview**: the overview page displays guideline count, latest update time, and recent guideline evolution from git history.

## Session Injection Details

The Chat and Apply `<guidelines>` index comes from the current workspace:

- If the stage uses a linked worktree, FylloCode scans that worktree's `guidelines/` first.
- Otherwise it scans the main project `guidelines/`.
- If there is no `guidelines/` directory or no Markdown files, no `<guidelines>` block is injected.
- Angle brackets in frontmatter are escaped so user-authored metadata cannot close the `<guidelines>` block early.

## lineage Tool

`lineage` retrieves the design history behind existing code. It returns a projection of the FylloCode lineage subject, including task summary, Chat sessions, proposals, plans, commit hashes, proposal paths, and current proposal status.

Use it when the user asks why code was written a certain way, which task produced a commit, or whether a proposal eventually landed. Git commit messages alone usually cannot answer those questions; `lineage` traces the change back to tasks, discussions, and OpenSpec artifacts.

It has three query modes:

| mode | Input | Returns |
| --- | --- | --- |
| `trace-file` | `filePath`, optional `lineRange` | Finds commits that touched the file and returns matching lineage entries. This is the preferred entry point for "why does this file look like this?" questions. |
| `trace-commit` | `commitHash` | Returns the lineage entry for that commit. |
| `trace-proposal` | `changeId` | Returns the lineage entry for that OpenSpec change. |

When there is no match or the project has no lineage data, the tool returns `null` or an empty array. It only reads project data and git history; it does not modify files.

## When to Use It

`fyllo-cortex` addresses how teams continuously capture and retrieve engineering knowledge. `guidelines` carries conventions, pitfalls, and boundary rules into later sessions; `lineage` lets later Agents trace code, commits, or proposals back to the task and decision context that produced them.
