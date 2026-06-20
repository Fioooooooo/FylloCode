---
sidebar:
  group: Reference
  order: 30
---

# fyllo-cortex MCP

`fyllo-cortex` is a built-in MCP server in FylloCode. It currently provides one tool: `guidelines`.

## guidelines Tool

`guidelines` maintains and reads project guidelines. It has two modes:

| mode | Returned Content | Modifies Files |
| --- | --- | --- |
| `write` | Guideline authoring contract, including project rule file structure and maintenance rules. | No |
| `read` | A JSON list after scanning current project `guidelines/**/*.md`. | No |

`write` mode does not generate or overwrite files directly. It returns the contract that should be followed when writing guidelines. Actual edits are still made by the Agent according to project facts.

## Recommended File Structure

Guidelines in FylloCode projects usually include:

- Root `AGENTS.md`: entry instructions for Agents
- `guidelines/*.md`: detailed rules split by topic

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

The `read` mode parses YAML frontmatter at the top of guideline files.

Recommended fields:

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

Files without frontmatter are also returned. If frontmatter parsing fails, the entry includes `parseError`.

## When to Use It

`fyllo-cortex` addresses how teams continuously capture engineering knowledge. After each task, Agents can update guidelines with new conventions, pitfalls, and boundary rules so future sessions start from the latest rules.
