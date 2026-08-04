---
sidebar:
  group: Reference
  order: 30
---

# fyllo-cortex MCP

`fyllo-cortex` is a built-in MCP server in FylloCode, built as the Agent's "brain": guidelines and knowledge let project engineering knowledge accumulate across sessions, and lineage lets later Agents trace historical decisions. It provides three tools:

| Tool | Purpose |
| --- | --- |
| `guidelines` | Maintains project engineering conventions so later Agent sessions can read the current rules. |
| `knowledge` | Maintains project knowledge entries shared across tasks and sessions. |
| `lineage` | Traces code, commits, or proposals back to the task, session, and design-decision context behind them. |

## Bundled Transport and Context

Inside the FylloCode application, `fyllo-cortex` is hosted by an application-level bundled MCP host. ACP Agents that declare HTTP MCP capability reuse one backend process through a stable loopback proxy; each Workspace MCP activation receives its own capability, and the proxy validates the server scope before injecting Workspace v2 context. stdio receives the same frozen descriptor through `FYLLO_WORKSPACE_JSON`. Callers never see the internal bearer token and cannot forge Project/Folder context through caller headers or cwd.

When an Agent lacks HTTP support, the backend is not ready, or the host is unavailable, FylloCode falls back to stdio. The `guidelines`, `knowledge`, and `lineage` tool names and modes remain, while Workspace v2 owner inputs and repository-evidence contracts have changed. Setting `FYLLO_DISABLE_BUNDLED_MCP=1` disables bundled MCP injection completely.

## guidelines Tool

`guidelines` maintains guidelines for a selected Project. Normal guideline reading does not go through this tool:

1. When a new Chat / Apply ACP session starts, FylloCode scans `guidelines/**/*.md` in authorized Workspace Projects.
2. It builds an ownership-qualified `<guidelines>` index from each file's frontmatter and injects that index into the system reminder.
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
- **Proposal creation**: the instruction returned by `fyllo-specs create-proposal` requires the Agent to decide while writing `tasks.md` whether a concrete local-repository guideline update task is needed. Existing OpenSpec config remains unchanged.
- **Apply**: before editing code, the Agent reads relevant guidelines; if implementation reveals missing, stale, or conflicting guidelines, it calls the maintenance tool.
- **Archive**: before final archive, the Agent checks whether the completed change altered commands, architecture, tests, workflow, data contracts, or project conventions.
- **Project Health Check**: guideline health is reported separately from the score and handled directly with `init` / `create` / `update`, without going through Proposal.
- **Project Overview**: the overview page displays guideline count, latest update time, and recent guideline evolution from git history.

## Session Injection Details

The Chat and Apply `<guidelines>` index comes from the current workspace:

- Chat scans each Project in the Session Workspace snapshot; if a Project uses a linked worktree, FylloCode scans that worktree's `guidelines/` first.
- Apply and other single-repository stages scan the Proposal owner's worktree or main repository.
- If there is no `guidelines/` directory or no Markdown files, no `<guidelines>` block is injected.
- Angle brackets in frontmatter are escaped so user-authored metadata cannot close the `<guidelines>` block early.

## knowledge Tool

`knowledge` maintains durable Workspace knowledge stored in FylloCode's app data directory. Unlike guidelines, knowledge entries are not written into a Project repository. They are shared across Projects, tasks, and sessions, while repository evidence retains its owning `folderId`. See [Knowledge](/en/docs/features/knowledge) for the product view.

### When capture triggers

The Agent doesn't call this tool continuously. It follows a judgment test: if this fact were lost, would a future session pay for it by re-deriving it, re-reading it, or getting it wrong? When the test is met, the Agent places a `knowledge.flag` [fyllo-action](/en/docs/reference/fyllo-action) card in the session as a bookmark. It does not call the `knowledge` tool yet or interrupt the discussion.

The Agent calls the `knowledge` tool with `mode: capture` only after you confirm a pending flag card in the chat transcript or explicitly ask to capture durable knowledge. It bundles every pending flag in the session into one capture request. The session event rail only summarizes and locates these items; it has no confirmation buttons.

### Maintenance modes

| mode | Triggered when | Modifies Files |
| --- | --- | --- |
| `capture` | The user confirms a `knowledge.flag`, or explicitly asks to capture knowledge | No, returns authoring instructions |
| `update` | The user asks to revise an existing entry | No, returns revision instructions |
| `retire` | The user asks to remove an entry | No, returns retirement instructions |
| `audit` | The user asks to inspect stale, unknown, duplicate, or low-quality entries | No |

Like `guidelines`, the `knowledge` tool does not write files directly. It returns current state plus mode-specific authoring instructions; the Agent writes the entry content based on that guidance.

After the Agent finishes a `capture` write or an `update` revision, it places a `knowledge.review` card. Once confirmed, FylloCode opens that entry's latest saved content from disk for editing and review, with the full Markdown source saved as it changes.

## lineage Tool

`lineage` retrieves the design history behind existing code. It returns a projection of the FylloCode lineage subject, including task summary, Chat sessions, proposals, plans, commit hashes, proposal paths, and current proposal status. Repository traces require an explicit owning `folderId`; an optional `worktreePath` must be registered for that Folder.

Use it when the user asks why code was written a certain way, which task produced a commit, or whether a proposal eventually landed. Git commit messages alone usually cannot answer those questions; `lineage` traces the change back to tasks, discussions, and OpenSpec artifacts.

It has three query modes:

| mode | Input | Returns |
| --- | --- | --- |
| `trace-file` | `folderId`, `filePath`, optional `lineRange` / `worktreePath` | Finds commits in the selected Project that touched the file and returns lineage entries with repository origins and references. |
| `trace-commit` | `folderId`, `commitHash`, optional `worktreePath` | Returns the lineage entry for that commit in the selected Project. |
| `trace-proposal` | `folderId`, `changeId`, optional `worktreePath` | Returns the lineage entry for that OpenSpec change in the selected Project. |

When there is no match or the project has no lineage data, the tool returns `null` or an empty array. It only reads project data and git history; it does not modify files.

## When to Use It

`fyllo-cortex` captures and retrieves engineering knowledge. `guidelines` carries conventions, pitfalls, and boundary rules into later sessions. `knowledge` carries Workspace-level facts that do not belong in guidelines, such as business context, user directives, and unexpected findings. `lineage` lets later Agents trace code, commits, or proposals within an explicit Project/Folder back to the task and decision context that produced them.
