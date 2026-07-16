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

The page offers three filters — **All**, **Installed**, and **Custom**. The first two browse Agents from the ACP Registry; **Custom** is a separate JSON editing area.

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

Saved configuration is written to a local `custom-agents.json`. It is not synced to the registry and isn't covered by FylloCode's install/update management — installing and upgrading the command itself remains the user's responsibility.
