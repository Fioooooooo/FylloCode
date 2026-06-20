---
sidebar:
  group: Product Features
  order: 70
---

# ACP Agents

FylloCode connects different Coding Agents through Agent Client Protocol. The ACP Agents page shows available Agents from the registry and manages installation, updates, and local detection state.

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

## Agent Kinds

FylloCode labels ACP Agents with three kinds:

| Kind | Meaning |
| --- | --- |
| `native` | A native ACP Agent with a complete implementation and no external CLI dependency. |
| `adapter` | An independent adapter implementation that can share config or environment variables with the official CLI but does not call a local CLI at runtime. |
| `bridge` | A bridge layer that performs work through a local command-line tool at runtime. |

See [ACP Agent Kinds](/en/docs/reference/acp-agent-kind) for detailed classification rules.
