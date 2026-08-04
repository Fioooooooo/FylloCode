---
sidebar:
  group: Product Features
  order: 70
---

# ACP Agents

FylloCode connects different Coding Agents through Agent Client Protocol. The ACP Agents page under [Settings](/en/docs/features/settings) is available at `/settings/acp-agents`; it shows available Agents from the registry and manages installation, updates, and local detection state.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/acp-registry.png" alt="ACP Agents page screenshot" />
</figure>

## Main Capabilities

- View Agents that support ACP
- Search Agents
- Install and update Agents managed by FylloCode
- Detect Agents already installed by the user
- Show version, license, author, and installation state
- Label Agent kinds with FylloCode semantics
- Configure a custom Agent that isn't in the registry

The page offers three filters: **All**, **Installed**, and **Custom**. The first two browse Agents from the ACP Registry; **Custom** is a separate JSON editing area.

## Agent Kinds

FylloCode labels ACP Agents with three kinds:

| Kind | Meaning |
| --- | --- |
| `native` | A native ACP Agent with a complete implementation and no external CLI dependency. |
| `adapter` | An independent adapter implementation that can share config or environment variables with the official CLI but does not call a local CLI at runtime. |
| `bridge` | A bridge layer that performs work through a local command-line tool at runtime. |

See [ACP Agent Kinds](/en/docs/reference/acp-agent-kind) for detailed classification rules.

## Custom Agents

If a Coding Agent supports ACP but hasn't been added to the registry yet, you can register it manually in the **Custom** tab so it appears in the Agent picker alongside registry Agents.

The configuration is edited as JSON, structured as an `agent_servers` map:

```json
{
  "agent_servers": {
    "Kimi Code CLI": {
      "command": "~/.local/bin/kimi",
      "args": ["acp"],
      "env": {}
    }
  }
}
```

| Field | Description |
| --- | --- |
| `command` | Path to the Agent's executable. Supports `~` expansion and PATH lookup (required). |
| `args` | Array of startup arguments, e.g. `["acp"]` (optional). |
| `env` | Extra environment variables, merged on top of the system environment (optional). |

Saved configuration is written to a local `custom-agents.json`. It is not synced to the registry and isn't covered by FylloCode's install/update management. Installing and upgrading the command itself remains your responsibility.

## Connection Warmup and Reuse

After main-process startup completes, FylloCode prewarms every installed registry Agent and valid custom Agent in the background. Warmup starts the ACP process and completes `initialize` only. It does not create a Chat session or fetch Workspace-level configuration and commands early, and it still runs while only the Launcher is open.

Installing, upgrading, or saving custom Agents schedules incremental warmup for the affected connections. Before an upgrade, uninstall, or custom-Agent `command`, `args`, or `env` change, FylloCode intentionally stops the old process so the next connection uses the new runtime configuration. One failed Agent does not block window startup or other Agents. If you select an Agent while it is warming up, Chat joins the same in-flight connection instead of starting another process.

After successful initialization, FylloCode caches complete authentication, prompt, MCP, and session capability snapshots. Older prompt-only cache files remain readable and are gradually refreshed after Agents initialize successfully; no manual migration is required.

## Multi-root ACP Sessions

A Workspace can contain up to 16 Projects. When an Agent advertises support for additional directories, FylloCode passes the primary Project and authorized additional Project directories when creating the ACP Session. The Session keeps the Workspace snapshot from creation; later member additions, removals, or relocations do not silently change a running Session's context. The Chat header scope popover distinguishes members in the current snapshot, members only in the latest Workspace, and stale members. See [Multi-root Workspace](/en/docs/features/multi-root-workspace) for the full product model and cross-Project boundaries.

## Session Configuration Recovery

FylloCode saves the Agent-confirmed model, mode, thought level, and other session `configOptions` with session metadata. After an app restart or Agent reconnection, it restores values that are still supported by the current Agent schema before sending the first resumed prompt. Removed options, changed types, and invalid values fall back to the Agent's current valid value while other compatible options continue to recover.

If the Agent cannot confirm a still-compatible value, the current prompt ends through the existing ACP error path instead of silently using a default. Older sessions without persisted configuration continue through the previous recovery flow and require no migration.
